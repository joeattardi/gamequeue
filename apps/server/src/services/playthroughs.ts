import { and, desc, eq, isNull } from 'drizzle-orm';
import {
    nextStatus,
    statusFromHistory,
    type CloseInput,
    type EntryDto,
    type LogPlaythroughInput,
    type PatchPlaythroughInput,
    type PlaythroughDto,
    type StartInput,
    type StatusAction
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, entryPlatforms, platforms, playthroughs, slots } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { existingPlatformIds } from './games.js';
import { getEntry } from './entries.js';
import { dequeue } from './lists.js';
import { toDto } from './playthrough-dto.js';

const DAY_MS = 24 * 3600 * 1000;
const utcToday = () => new Date().toISOString().slice(0, 10);

/** Clients send their local date; allow a day of slack for timezones ahead of UTC. */
function assertNotFuture(date: string | null | undefined, label: string) {
    if (date && date > new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)) {
        throw new HttpError(400, `${label} can't be in the future`);
    }
}

function assertOrder(startedOn: string | null | undefined, endedOn: string | null | undefined) {
    if (startedOn && endedOn && endedOn < startedOn) {
        throw new HttpError(400, "The end date can't be before the start date");
    }
}

function requireEntry(db: Db, userId: number, entryId: number) {
    const row = db
        .select()
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Entry not found');
    return row;
}

const openPlaythroughRow = (db: Db, entryId: number) =>
    db
        .select()
        .from(playthroughs)
        .where(and(eq(playthroughs.entryId, entryId), isNull(playthroughs.outcome)))
        .get();

/** A game that is no longer playing or paused doesn't belong in a slot. */
export function vacateSlots(db: Db, entryId: number) {
    db.update(slots).set({ entryId: null }).where(eq(slots.entryId, entryId)).run();
}

/** Recomputes the entry's status from its playthrough history. */
export function syncStatus(db: Db, entryId: number) {
    const entry = db.select().from(entries).where(eq(entries.id, entryId)).get()!;
    const items = db.select().from(playthroughs).where(eq(playthroughs.entryId, entryId)).all();
    const status = statusFromHistory(entry.status, items);
    if (status !== entry.status) {
        db.update(entries)
            .set({ status, updatedAt: Date.now() })
            .where(eq(entries.id, entryId))
            .run();
    }
    if (status !== 'playing' && status !== 'paused') vacateSlots(db, entryId);
}

/** A rated finish pre-fills the entry's own rating, but never overwrites one the user set. */
function prefillEntryRating(db: Db, entryId: number, rating: number | null | undefined) {
    if (rating == null) return;
    const entry = db
        .select({ rating: entries.rating })
        .from(entries)
        .where(eq(entries.id, entryId))
        .get()!;
    if (entry.rating === null)
        db.update(entries).set({ rating }).where(eq(entries.id, entryId)).run();
}

function resolvePlatform(
    db: Db,
    entryId: number,
    requested: number | undefined,
    ownedOnly: boolean
) {
    const owned = db
        .select({ id: entryPlatforms.platformId })
        .from(entryPlatforms)
        .where(eq(entryPlatforms.entryId, entryId))
        .all()
        .map((r) => r.id);
    if (requested === undefined) {
        if (owned.length === 1) return owned[0]!;
        throw new HttpError(400, 'Choose which platform you played it on');
    }
    if (
        ownedOnly
            ? !owned.includes(requested)
            : !existingPlatformIds(db, [requested]).has(requested)
    ) {
        throw new HttpError(
            400,
            ownedOnly ? "You don't own this game on that platform" : 'Unknown platform'
        );
    }
    return requested;
}

function notAllowed(status: string, action: StatusAction): never {
    throw new HttpError(409, `Can't ${action} a game that is ${status}`);
}

export function startPlaythrough(
    db: Db,
    userId: number,
    entryId: number,
    input: StartInput
): EntryDto {
    const entry = requireEntry(db, userId, entryId);
    const to = nextStatus(entry.status, 'start');
    if (!to) notAllowed(entry.status, 'start');
    assertNotFuture(input.date, 'The start date');
    const platformId = resolvePlatform(db, entryId, input.platformId, true);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        t.insert(playthroughs)
            .values({ userId, entryId, platformId, startedOn: input.date ?? utcToday() })
            .run();
        t.update(entries)
            .set({ status: to, updatedAt: Date.now() })
            .where(eq(entries.id, entryId))
            .run();
        dequeue(t, userId, entryId);
    });
    return getEntry(db, userId, entryId)!;
}

/** Pause and resume only change status; the playthrough stays open throughout. */
export function togglePause(
    db: Db,
    userId: number,
    entryId: number,
    action: 'pause' | 'resume'
): EntryDto {
    const entry = requireEntry(db, userId, entryId);
    const to = nextStatus(entry.status, action);
    if (!to) notAllowed(entry.status, action);
    db.update(entries)
        .set({ status: to, updatedAt: Date.now() })
        .where(eq(entries.id, entryId))
        .run();
    return getEntry(db, userId, entryId)!;
}

export function closePlaythrough(
    db: Db,
    userId: number,
    entryId: number,
    action: 'finish' | 'abandon',
    input: CloseInput
): EntryDto {
    const entry = requireEntry(db, userId, entryId);
    const to = nextStatus(entry.status, action);
    if (!to) notAllowed(entry.status, action);
    const open = openPlaythroughRow(db, entryId);
    if (!open) throw new HttpError(409, 'There is no playthrough in progress');
    const endedOn = input.date ?? utcToday();
    assertNotFuture(endedOn, 'The end date');
    assertOrder(open.startedOn, endedOn);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        t.update(playthroughs)
            .set({ outcome: to as 'finished' | 'abandoned', endedOn, rating: input.rating ?? null })
            .where(eq(playthroughs.id, open.id))
            .run();
        t.update(entries)
            .set({ status: to, updatedAt: Date.now() })
            .where(eq(entries.id, entryId))
            .run();
        prefillEntryRating(t, entryId, input.rating);
        vacateSlots(t, entryId);
    });
    return getEntry(db, userId, entryId)!;
}

export function logPlaythrough(
    db: Db,
    userId: number,
    entryId: number,
    input: LogPlaythroughInput
): EntryDto {
    requireEntry(db, userId, entryId);
    assertNotFuture(input.startedOn, 'The start date');
    assertNotFuture(input.endedOn, 'The end date');
    assertOrder(input.startedOn, input.endedOn);
    const platformId = resolvePlatform(db, entryId, input.platformId, false);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        t.insert(playthroughs)
            .values({
                userId,
                entryId,
                platformId,
                startedOn: input.startedOn ?? null,
                endedOn: input.endedOn ?? null,
                outcome: input.outcome,
                rating: input.rating ?? null
            })
            .run();
        if (input.outcome === 'finished') prefillEntryRating(t, entryId, input.rating);
        syncStatus(t, entryId);
    });
    return getEntry(db, userId, entryId)!;
}

function requirePlaythrough(db: Db, userId: number, id: number) {
    const row = db
        .select()
        .from(playthroughs)
        .where(and(eq(playthroughs.id, id), eq(playthroughs.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Playthrough not found');
    return row;
}

export function patchPlaythrough(
    db: Db,
    userId: number,
    id: number,
    patch: PatchPlaythroughInput
): EntryDto {
    const current = requirePlaythrough(db, userId, id);
    const isOpen = current.outcome === null;
    // Closing an open playthrough goes through finish/abandon so status and slots stay consistent
    if (isOpen && (patch.outcome !== undefined || (patch.endedOn ?? null) !== null)) {
        throw new HttpError(409, 'Finish or abandon the game to close this playthrough');
    }
    const next = { ...current, ...patch };
    assertNotFuture(next.startedOn, 'The start date');
    assertNotFuture(next.endedOn, 'The end date');
    assertOrder(next.startedOn, next.endedOn);
    if (patch.platformId !== undefined)
        resolvePlatform(db, current.entryId, patch.platformId, false);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        t.update(playthroughs)
            .set({
                startedOn: next.startedOn,
                endedOn: next.endedOn,
                outcome: next.outcome,
                platformId: next.platformId,
                rating: next.rating
            })
            .where(eq(playthroughs.id, id))
            .run();
        syncStatus(t, current.entryId);
    });
    return getEntry(db, userId, current.entryId)!;
}

export function deletePlaythrough(db: Db, userId: number, id: number): EntryDto {
    const current = requirePlaythrough(db, userId, id);
    db.transaction((tx) => {
        const t = tx as unknown as Db;
        t.delete(playthroughs).where(eq(playthroughs.id, id)).run();
        syncStatus(t, current.entryId);
    });
    return getEntry(db, userId, current.entryId)!;
}

/** Newest first: open playthrough on top, then by end date (unknown dates last). */
export function listPlaythroughs(db: Db, userId: number, entryId: number): PlaythroughDto[] {
    requireEntry(db, userId, entryId);
    return db
        .select({ p: playthroughs, platform: platforms })
        .from(playthroughs)
        .leftJoin(platforms, eq(platforms.id, playthroughs.platformId))
        .where(eq(playthroughs.entryId, entryId))
        .orderBy(
            desc(isNull(playthroughs.outcome)),
            desc(playthroughs.endedOn),
            desc(playthroughs.startedOn),
            desc(playthroughs.id)
        )
        .all()
        .map(({ p, platform }) => toDto(p, platform));
}
