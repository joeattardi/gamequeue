import { and, asc, eq, max } from 'drizzle-orm';
import { MAX_SLOTS, type ExportEntry, type ExportFile, type ImportReport } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    entryPlatforms,
    entryTags,
    games,
    listItems,
    lists,
    playthroughs,
    slots,
    tags,
    wishlistItems
} from '../db/schema.js';
import { saveGame, upsertPlatforms } from './games.js';
import { setTags } from './entries.js';
import { ensureQueue } from './lists.js';
import { syncStatus } from './playthroughs.js';
import { dropFromWishlists, ensureWishlist } from './wishlist.js';

const MAX_NOTES = 50;

/** Thrown to roll the transaction back after a dry run has produced its report. */
class DryRunComplete extends Error {}

const lower = (s: string) => s.toLowerCase();

/**
 * Merges an export file into the user's data. Nothing of the user's is deleted or overwritten:
 * existing values win, empty ones are filled in, and collections are unioned. Matching is by IGDB id
 * (games), name (lists, slots) or identical dates/platform/outcome (playthroughs), so importing the
 * same file twice changes nothing.
 *
 * Everything runs in one transaction. A dry run executes the real import and then rolls back, so its
 * report is exactly what committing would do.
 */
export function importData(
    db: Db,
    userId: number,
    file: ExportFile,
    opts: { dryRun: boolean }
): ImportReport {
    const report: ImportReport = {
        dryRun: opts.dryRun,
        games: { added: 0, updated: 0, unchanged: 0 },
        playthroughs: { added: 0, duplicates: 0, skipped: 0 },
        lists: { created: 0, itemsAdded: 0 },
        queue: { added: 0 },
        wishlist: { added: 0 },
        slots: { created: 0, filled: 0 },
        notes: [],
        moreNotes: 0
    };
    const note = (message: string) =>
        report.notes.length < MAX_NOTES ? report.notes.push(message) : report.moreNotes++;

    try {
        db.transaction((tx) => {
            merge(tx as unknown as Db, userId, file, report, note);
            if (opts.dryRun) throw new DryRunComplete();
        });
    } catch (e) {
        if (!(e instanceof DryRunComplete)) throw e;
    }
    return report;
}

function merge(
    db: Db,
    userId: number,
    file: ExportFile,
    report: ImportReport,
    note: (m: string) => void
) {
    const now = Date.now();
    const entryIdByGame = new Map<number, number>();
    const nameByGame = new Map(file.games.map((g) => [g.igdbId, g.game.name]));

    const existing = new Map(
        db
            .select()
            .from(entries)
            .where(eq(entries.userId, userId))
            .all()
            .map((e) => [e.gameId, e])
    );
    const cached = new Set(
        db
            .select({ id: games.id })
            .from(games)
            .all()
            .map((r) => r.id)
    );

    for (const g of file.games) {
        // Shared metadata cache: add games we've never seen, never touch ones we have
        if (!cached.has(g.igdbId)) {
            saveGame(db, { id: g.igdbId, ...g.game }, now, { keepExistingPlatforms: true });
            cached.add(g.igdbId);
        }
        upsertPlatforms(
            db,
            [...g.platforms, ...g.playthroughs.flatMap((p) => (p.platform ? [p.platform] : []))],
            { keepExisting: true }
        );
        entryIdByGame.set(
            g.igdbId,
            mergeGame(db, userId, g, existing.get(g.igdbId), report, note, now)
        );
    }

    mergeLists(db, userId, file, entryIdByGame, report);
    mergeSlots(db, userId, file, entryIdByGame, nameByGame, report, note);
    mergeWishlist(db, userId, file, cached, report, note, now);
}

/** Returns the entry id. */
function mergeGame(
    db: Db,
    userId: number,
    g: ExportEntry,
    existing: typeof entries.$inferSelect | undefined,
    report: ImportReport,
    note: (m: string) => void,
    now: number
): number {
    const name = g.game.name;
    const platformIds = [...new Set(g.platforms.map((p) => p.id))];
    let changed = false;
    let entryId: number;
    let statusBefore: string | undefined;

    if (!existing) {
        entryId = db
            .insert(entries)
            .values({
                userId,
                gameId: g.igdbId,
                status: g.status,
                rating: g.rating,
                notes: g.notes,
                ttbOverrideMinutes: g.ttbOverrideMinutes,
                addedAt: g.addedAt || now,
                updatedAt: now
            })
            .returning({ id: entries.id })
            .get().id;
        db.insert(entryPlatforms)
            .values(platformIds.map((platformId) => ({ entryId, platformId })))
            .run();
        setTags(db, userId, entryId, g.tags);
        // Owning it ends the wish
        dropFromWishlists(db, userId, g.igdbId);
        report.games.added++;
    } else {
        entryId = existing.id;
        statusBefore = existing.status;
        const set: Partial<typeof entries.$inferInsert> = {};

        if (existing.rating === null) {
            if (g.rating !== null) set.rating = g.rating;
        } else if (g.rating !== null && g.rating !== existing.rating) {
            note(`${name}: kept your rating of ${existing.rating} (the file has ${g.rating})`);
        }
        if (existing.notes === '') {
            if (g.notes !== '') set.notes = g.notes;
        } else if (g.notes !== '' && g.notes !== existing.notes) {
            note(`${name}: kept your notes (they differ from the file's)`);
        }
        if (existing.ttbOverrideMinutes === null) {
            if (g.ttbOverrideMinutes !== null) set.ttbOverrideMinutes = g.ttbOverrideMinutes;
        } else if (
            g.ttbOverrideMinutes !== null &&
            g.ttbOverrideMinutes !== existing.ttbOverrideMinutes
        ) {
            note(`${name}: kept your time-to-beat estimate (the file has a different one)`);
        }
        if (Object.keys(set).length > 0) {
            db.update(entries)
                .set({ ...set, updatedAt: now })
                .where(eq(entries.id, entryId))
                .run();
            changed = true;
        }

        // Owned platforms and tags are unions
        const have = new Set(
            db
                .select({ id: entryPlatforms.platformId })
                .from(entryPlatforms)
                .where(eq(entryPlatforms.entryId, entryId))
                .all()
                .map((r) => r.id)
        );
        const missing = platformIds.filter((id) => !have.has(id));
        if (missing.length > 0) {
            db.insert(entryPlatforms)
                .values(missing.map((platformId) => ({ entryId, platformId })))
                .run();
            changed = true;
        }
        const haveTags = db
            .select({ name: tags.name })
            .from(entryTags)
            .innerJoin(tags, eq(tags.id, entryTags.tagId))
            .where(eq(entryTags.entryId, entryId))
            .all()
            .map((r) => r.name);
        const haveLower = new Set(haveTags.map(lower));
        const newTags = g.tags.filter((t) => !haveLower.has(lower(t)));
        if (newTags.length > 0) {
            setTags(db, userId, entryId, [...haveTags, ...newTags]);
            changed = true;
        }
    }

    // Playthroughs: add the ones you don't already have
    const keyOf = (p: {
        platformId: number | null;
        startedOn: string | null;
        endedOn: string | null;
        outcome: string | null;
    }) => [p.platformId ?? '', p.startedOn ?? '', p.endedOn ?? '', p.outcome ?? ''].join('|');
    const current = existing
        ? db.select().from(playthroughs).where(eq(playthroughs.entryId, entryId)).all()
        : [];
    const keys = new Set(current.map(keyOf));
    let hasOpen = current.some((p) => p.outcome === null);
    for (const p of g.playthroughs) {
        const row = {
            platformId: p.platform?.id ?? null,
            startedOn: p.startedOn,
            endedOn: p.endedOn,
            outcome: p.outcome
        };
        if (keys.has(keyOf(row))) {
            report.playthroughs.duplicates++;
            continue;
        }
        if (p.outcome === null && hasOpen) {
            report.playthroughs.skipped++;
            note(`${name}: skipped an in-progress playthrough because you already have one`);
            continue;
        }
        db.insert(playthroughs)
            .values({ userId, entryId, ...row, rating: p.rating })
            .run();
        keys.add(keyOf(row));
        if (p.outcome === null) hasOpen = true;
        report.playthroughs.added++;
        changed = true;
    }

    // Status is always derived from history, so the file can't leave it inconsistent
    syncStatus(db, entryId);
    if (existing) {
        const after = db
            .select({ status: entries.status })
            .from(entries)
            .where(eq(entries.id, entryId))
            .get()!;
        if (after.status !== statusBefore) changed = true;
        if (changed) report.games.updated++;
        else report.games.unchanged++;
    }
    return entryId;
}

function mergeLists(
    db: Db,
    userId: number,
    file: ExportFile,
    entryIdByGame: Map<number, number>,
    report: ImportReport
) {
    const byName = new Map<string, number>();
    for (const l of db
        .select()
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'list')))
        .orderBy(asc(lists.id))
        .all()) {
        if (!byName.has(lower(l.name))) byName.set(lower(l.name), l.id);
    }
    for (const fl of file.lists) {
        let listId = byName.get(lower(fl.name));
        if (listId === undefined) {
            listId = db
                .insert(lists)
                .values({ userId, name: fl.name })
                .returning({ id: lists.id })
                .get().id;
            byName.set(lower(fl.name), listId);
            report.lists.created++;
        }
        const present = new Set(
            db
                .select({ entryId: listItems.entryId })
                .from(listItems)
                .where(eq(listItems.listId, listId))
                .all()
                .map((r) => r.entryId)
        );
        let position =
            (db
                .select({ n: max(listItems.position) })
                .from(listItems)
                .where(eq(listItems.listId, listId))
                .get()!.n ?? -1) + 1;
        for (const gameId of new Set(fl.games)) {
            const entryId = entryIdByGame.get(gameId)!;
            if (present.has(entryId)) continue;
            db.insert(listItems).values({ listId, entryId, position: position++ }).run();
            present.add(entryId);
            report.lists.itemsAdded++;
        }
    }

    // Queue: games already queued keep their place; new ones go on the end
    if (file.queue.length > 0) {
        const queueId = ensureQueue(db, userId).id;
        const queued = new Set(
            db
                .select({ entryId: listItems.entryId })
                .from(listItems)
                .where(eq(listItems.listId, queueId))
                .all()
                .map((r) => r.entryId)
        );
        let position =
            (db
                .select({ n: max(listItems.position) })
                .from(listItems)
                .where(eq(listItems.listId, queueId))
                .get()!.n ?? -1) + 1;
        for (const gameId of new Set(file.queue)) {
            const entryId = entryIdByGame.get(gameId)!;
            if (queued.has(entryId)) continue;
            db.insert(listItems).values({ listId: queueId, entryId, position: position++ }).run();
            queued.add(entryId);
            report.queue.added++;
        }
    }
}

function mergeSlots(
    db: Db,
    userId: number,
    file: ExportFile,
    entryIdByGame: Map<number, number>,
    nameByGame: Map<number, string>,
    report: ImportReport,
    note: (m: string) => void
) {
    const mine = db
        .select()
        .from(slots)
        .where(eq(slots.userId, userId))
        .orderBy(asc(slots.position))
        .all();
    const matched = new Set<number>();
    let count = mine.length;
    let top = mine.reduce((m, s) => Math.max(m, s.position), -1);

    for (const fs of [...file.slots].sort((a, b) => a.position - b.position)) {
        // Slots are matched by name; a missing one is created (up to the limit)
        let slot = mine.find((s) => !matched.has(s.id) && lower(s.name) === lower(fs.name));
        if (!slot) {
            if (count >= MAX_SLOTS) {
                note(`Skipped the slot "${fs.name}": you already have ${MAX_SLOTS} slots`);
                continue;
            }
            slot = db
                .insert(slots)
                .values({ userId, name: fs.name, position: ++top })
                .returning()
                .get();
            count++;
            report.slots.created++;
        }
        matched.add(slot.id);
        if (fs.igdbId === null) continue;

        // Only ever fill an empty slot with a game that's genuinely in progress and not slotted elsewhere
        const game = nameByGame.get(fs.igdbId)!;
        const entryId = entryIdByGame.get(fs.igdbId)!;
        const row = db.select().from(slots).where(eq(slots.id, slot.id)).get()!;
        if (row.entryId !== null) {
            if (row.entryId !== entryId)
                note(`${slot.name} is occupied, so ${game} wasn't put in it`);
            continue;
        }
        const entry = db
            .select({ status: entries.status })
            .from(entries)
            .where(eq(entries.id, entryId))
            .get()!;
        if (entry.status !== 'playing' && entry.status !== 'paused') {
            note(`${game} isn't in progress here, so it wasn't put in ${slot.name}`);
            continue;
        }
        const elsewhere = db
            .select({ name: slots.name })
            .from(slots)
            .where(and(eq(slots.userId, userId), eq(slots.entryId, entryId)))
            .get();
        if (elsewhere) {
            note(`${game} is already in ${elsewhere.name}, so it wasn't put in ${slot.name}`);
            continue;
        }
        db.update(slots).set({ entryId }).where(eq(slots.id, slot.id)).run();
        report.slots.filled++;
    }
}

/**
 * Adds wishlisted games you don't have to the end of your wishlist. Games you own are skipped
 * (owning ends the wish), ones already wishlisted keep their place, and only empty platform/note
 * fields are filled in.
 */
function mergeWishlist(
    db: Db,
    userId: number,
    file: ExportFile,
    cached: Set<number>,
    report: ImportReport,
    note: (m: string) => void,
    now: number
) {
    if (file.wishlist.length === 0) return;
    const owned = new Set(
        db
            .select({ gameId: entries.gameId })
            .from(entries)
            .where(eq(entries.userId, userId))
            .all()
            .map((r) => r.gameId)
    );
    const wishlistId = ensureWishlist(db, userId).id;
    const present = new Map(
        db
            .select()
            .from(wishlistItems)
            .where(eq(wishlistItems.wishlistId, wishlistId))
            .all()
            .map((r) => [r.gameId, r])
    );
    let position =
        (db
            .select({ n: max(wishlistItems.position) })
            .from(wishlistItems)
            .where(eq(wishlistItems.wishlistId, wishlistId))
            .get()!.n ?? -1) + 1;

    for (const w of file.wishlist) {
        if (owned.has(w.igdbId)) {
            note(`${w.game.name} is in your collection, so it wasn't added to your wishlist`);
            continue;
        }
        if (!cached.has(w.igdbId)) {
            saveGame(db, { id: w.igdbId, ...w.game }, now, { keepExistingPlatforms: true });
            cached.add(w.igdbId);
        }
        if (w.platform) upsertPlatforms(db, [w.platform], { keepExisting: true });

        const have = present.get(w.igdbId);
        if (have) {
            const set: Partial<typeof wishlistItems.$inferInsert> = {};
            if (have.platformId === null && w.platform) set.platformId = w.platform.id;
            if (have.note === '' && w.note !== '') set.note = w.note;
            if (Object.keys(set).length > 0)
                db.update(wishlistItems)
                    .set(set)
                    .where(
                        and(
                            eq(wishlistItems.wishlistId, wishlistId),
                            eq(wishlistItems.gameId, w.igdbId)
                        )
                    )
                    .run();
            continue;
        }
        db.insert(wishlistItems)
            .values({
                wishlistId,
                gameId: w.igdbId,
                position: position++,
                platformId: w.platform?.id ?? null,
                note: w.note,
                addedAt: w.addedAt || now
            })
            .run();
        present.set(w.igdbId, {} as never);
        report.wishlist.added++;
    }
}
