import { and, asc, eq, max } from 'drizzle-orm';
import {
    MAX_SLOTS,
    nextStatus,
    type AssignSlotInput,
    type EntryDto,
    type SlotDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, slots } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { getEntry, hydrate } from './entries.js';
import { startPlaythrough, togglePause } from './playthroughs.js';

export function listSlots(db: Db, userId: number): SlotDto[] {
    const rows = db
        .select()
        .from(slots)
        .where(eq(slots.userId, userId))
        .orderBy(asc(slots.position))
        .all();
    const dtos = new Map<number, EntryDto>(
        hydrate(
            db,
            userId,
            rows.flatMap((r) => (r.entryId === null ? [] : [r.entryId]))
        ).map((e) => [e.id, e])
    );
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        entry: r.entryId === null ? null : (dtos.get(r.entryId) ?? null)
    }));
}

function requireSlot(db: Db, userId: number, id: number) {
    const slot = db
        .select()
        .from(slots)
        .where(and(eq(slots.id, id), eq(slots.userId, userId)))
        .get();
    if (!slot) throw new HttpError(404, 'Slot not found');
    return slot;
}

export function createSlot(db: Db, userId: number, name: string): SlotDto[] {
    const rows = db.select({ id: slots.id }).from(slots).where(eq(slots.userId, userId)).all();
    if (rows.length >= MAX_SLOTS)
        throw new HttpError(400, `You can have at most ${MAX_SLOTS} slots`);
    const top = db
        .select({ n: max(slots.position) })
        .from(slots)
        .where(eq(slots.userId, userId))
        .get()!.n;
    db.insert(slots)
        .values({ userId, name, position: (top ?? -1) + 1 })
        .run();
    return listSlots(db, userId);
}

export function renameSlot(db: Db, userId: number, id: number, name: string): SlotDto[] {
    requireSlot(db, userId, id);
    db.update(slots).set({ name }).where(eq(slots.id, id)).run();
    return listSlots(db, userId);
}

/** Takes a game out of its slot. It's paused (not dropped) so its playthrough stays open. */
function vacate(db: Db, userId: number, slot: typeof slots.$inferSelect) {
    if (slot.entryId === null) return;
    const entry = db.select().from(entries).where(eq(entries.id, slot.entryId)).get()!;
    db.update(slots).set({ entryId: null }).where(eq(slots.id, slot.id)).run();
    if (nextStatus(entry.status, 'pause')) togglePause(db, userId, entry.id, 'pause');
}

export function clearSlot(db: Db, userId: number, id: number): SlotDto[] {
    const slot = requireSlot(db, userId, id);
    db.transaction((tx) => vacate(tx as unknown as Db, userId, slot));
    return listSlots(db, userId);
}

export function deleteSlot(db: Db, userId: number, id: number): SlotDto[] {
    const slot = requireSlot(db, userId, id);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        vacate(t, userId, slot);
        t.delete(slots).where(eq(slots.id, id)).run();
    });
    return listSlots(db, userId);
}

export function reorderSlots(db: Db, userId: number, ids: number[]): SlotDto[] {
    const current = db.select({ id: slots.id }).from(slots).where(eq(slots.userId, userId)).all();
    const same =
        ids.length === current.length &&
        new Set(ids).size === ids.length &&
        current.every((s) => ids.includes(s.id));
    if (!same) throw new HttpError(400, 'Send every slot id exactly once');
    db.transaction((tx) => {
        // (user_id, position) is unique, so park everything on negative positions first
        ids.forEach((id, i) =>
            tx
                .update(slots)
                .set({ position: -(i + 1) })
                .where(eq(slots.id, id))
                .run()
        );
        ids.forEach((id, i) => tx.update(slots).set({ position: i }).where(eq(slots.id, id)).run());
    });
    return listSlots(db, userId);
}

/**
 * Puts a game in a slot, all in one transaction:
 * - the game starts (or resumes) so slot and status can't disagree;
 * - a game already in another slot is moved;
 * - an occupied slot needs `replace`, and the displaced game is paused.
 */
export function assignToSlot(
    db: Db,
    userId: number,
    slotId: number,
    input: AssignSlotInput
): SlotDto[] {
    const slot = requireSlot(db, userId, slotId);
    const entry = db
        .select()
        .from(entries)
        .where(and(eq(entries.id, input.entryId), eq(entries.userId, userId)))
        .get();
    if (!entry) throw new HttpError(404, 'Entry not found');
    if (slot.entryId === entry.id) return listSlots(db, userId);

    if (slot.entryId !== null && !input.replace) {
        throw new HttpError(409, 'That slot is already taken', {
            occupant: getEntry(db, userId, slot.entryId)
        });
    }

    db.transaction((tx) => {
        const t = tx as unknown as Db;
        // Free the game's current slot first (a move), then the target (a replacement)
        t.update(slots)
            .set({ entryId: null })
            .where(and(eq(slots.userId, userId), eq(slots.entryId, entry.id)))
            .run();
        vacate(t, userId, slot);
        t.update(slots).set({ entryId: entry.id }).where(eq(slots.id, slotId)).run();

        if (entry.status === 'paused') togglePause(t, userId, entry.id, 'resume');
        else if (entry.status !== 'playing') {
            startPlaythrough(t, userId, entry.id, {
                platformId: input.platformId,
                date: input.date
            });
        }
    });
    return listSlots(db, userId);
}
