import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { type ExportEntry, type ExportFile, type ImportReport } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    entryNotes,
    entryPlatforms,
    entryTags,
    games,
    listItems,
    lists,
    playthroughs,
    smartLists,
    tags,
    wishlistItems
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { callIgdb, existingPlatformIds, saveGame, upsertPlatforms } from './games.js';
import { setTags } from './entries.js';
import { ensureQueue } from './lists.js';
import { syncStatus } from './playthroughs.js';
import { dropFromWishlists, ensureWishlist } from './wishlist.js';

const MAX_NOTES = 50;
/**
 * Most games one import looks up (in the mirror or on IGDB) that the server hasn't cached yet. The
 * rest are left for the next run of the same file, which is safe since importing again only adds.
 */
export const MAX_NEW_GAMES_PER_IMPORT = 5000;

/** What the server knows of the games and platforms a file mentions, worked out before the merge. */
export interface ImportCatalog {
    /** Games in the shared cache: from IGDB or the mirror, never from the file */
    games: Set<number>;
    /** Platforms in the shared list */
    platforms: Set<number>;
    /** Games over `MAX_NEW_GAMES_PER_IMPORT`, not looked up this time */
    deferred: Set<number>;
}

/** Every IGDB id the file mentions, in file order. */
function fileGameIds(file: ExportFile): number[] {
    const ids = new Set<number>();
    for (const g of file.games) ids.add(g.igdbId);
    for (const w of file.wishlist) ids.add(w.igdbId);
    for (const l of file.lists) for (const g of l.games) ids.add(g);
    return [...ids];
}

function filePlatformIds(file: ExportFile): number[] {
    const ids = new Set<number>();
    for (const g of file.games) {
        for (const p of g.platforms) ids.add(p.id);
        for (const p of g.playthroughs) if (p.platform) ids.add(p.platform.id);
    }
    for (const w of file.wishlist) if (w.platform) ids.add(w.platform.id);
    return [...ids];
}

/**
 * Looks up the file's games the server hasn't cached yet, in the mirror or on IGDB, and caches
 * them, along with the platform list when the file names a platform we don't have. The file's own
 * metadata snapshots are never stored: they are whatever its author typed, and the cache is shared
 * by every user. Games and platforms IGDB doesn't know are left out, and the merge skips them.
 * Runs before a dry run too: what it caches is real IGDB data, as browsing a game page would.
 */
export async function resolveImportCatalog(
    db: Db,
    igdb: IgdbClient | undefined,
    file: ExportFile,
    maxNew = MAX_NEW_GAMES_PER_IMPORT
): Promise<ImportCatalog> {
    const ids = fileGameIds(file);
    const known = new Set<number>();
    for (let i = 0; i < ids.length; i += 500)
        for (const r of db
            .select({ id: games.id })
            .from(games)
            .where(inArray(games.id, ids.slice(i, i + 500)))
            .all())
            known.add(r.id);
    const missing = ids.filter((id) => !known.has(id));
    const lookup = missing.slice(0, maxNew);
    if (lookup.length > 0) {
        if (!igdb)
            throw new HttpError(
                503,
                "This file has games this server hasn't seen, and IGDB isn't configured to look them up."
            );
        const records = await callIgdb(() => igdb.fetchGames(lookup));
        db.transaction((tx) => {
            for (const r of records) saveGame(tx as unknown as Db, r);
        });
        for (const r of records) known.add(r.id);
    }

    const platformIds = filePlatformIds(file);
    let platforms = platformIds.length ? existingPlatformIds(db, platformIds) : new Set<number>();
    if (igdb && platformIds.some((id) => !platforms.has(id))) {
        const all = await callIgdb(() => igdb.fetchPlatforms());
        db.transaction((tx) => upsertPlatforms(tx as unknown as Db, all));
        platforms = existingPlatformIds(db, platformIds);
    }
    return { games: known, platforms, deferred: new Set(missing.slice(maxNew)) };
}

/** Thrown to roll the transaction back after a dry run has produced its report. */
class DryRunComplete extends Error {}

const lower = (s: string) => s.toLowerCase();

/**
 * Merges an export file into the user's data. Nothing of the user's is deleted or overwritten:
 * existing values win, empty ones are filled in, and collections are unioned. Matching is by IGDB id
 * (games), name (lists) or identical dates/platform/outcome (playthroughs), so importing the
 * same file twice changes nothing.
 *
 * Games and platforms come from `catalog` (see `resolveImportCatalog`): a game the server couldn't
 * find on IGDB is skipped with a note, and so is everything of it (list items, wishlist); an unknown platform is dropped.
 *
 * Everything runs in one transaction. A dry run executes the real import and then rolls back, so its
 * report is exactly what committing would do.
 */
export function importData(
    db: Db,
    userId: number,
    file: ExportFile,
    catalog: ImportCatalog,
    opts: { dryRun: boolean }
): ImportReport {
    const report: ImportReport = {
        dryRun: opts.dryRun,
        games: { added: 0, updated: 0, unchanged: 0, skipped: 0 },
        playthroughs: { added: 0, duplicates: 0, skipped: 0 },
        lists: { created: 0, itemsAdded: 0 },
        queue: { added: 0 },
        wishlist: { added: 0 },
        smartLists: { created: 0 },
        notes: [],
        moreNotes: 0
    };
    const note = (message: string) =>
        report.notes.length < MAX_NOTES ? report.notes.push(message) : report.moreNotes++;
    if (catalog.deferred.size > 0)
        note(
            `${catalog.deferred.size.toLocaleString('en-US')} games weren't looked up this time (at most ${MAX_NEW_GAMES_PER_IMPORT.toLocaleString('en-US')} new games per import): import the same file again to add them`
        );

    try {
        db.transaction((tx) => {
            merge(tx as unknown as Db, userId, file, catalog, report, note);
            if (opts.dryRun) throw new DryRunComplete();
        });
    } catch (e) {
        if (!(e instanceof DryRunComplete)) throw e;
    }
    return report;
}

/**
 * Whether the game is in the catalog; notes it when not (deferred games are covered by one note).
 * `what` names where the file had it, e.g. "the wishlist".
 */
function knownGame(
    catalog: ImportCatalog,
    igdbId: number,
    name: string,
    note: (m: string) => void,
    what?: string
) {
    if (catalog.games.has(igdbId)) return true;
    if (!catalog.deferred.has(igdbId))
        note(
            `${name} (IGDB id ${igdbId}) isn't on IGDB, so it was skipped${what ? ` in ${what}` : ''}`
        );
    return false;
}

function merge(
    db: Db,
    userId: number,
    file: ExportFile,
    catalog: ImportCatalog,
    report: ImportReport,
    note: (m: string) => void
) {
    const now = Date.now();
    const entryIdByGame = new Map<number, number>();

    const existing = new Map(
        db
            .select()
            .from(entries)
            .where(eq(entries.userId, userId))
            .all()
            .map((e) => [e.gameId, e])
    );
    const platformKnown = (p: { id: number } | null) => p !== null && catalog.platforms.has(p.id);

    for (const g of file.games) {
        if (!knownGame(catalog, g.igdbId, g.game.name, note)) {
            report.games.skipped++;
            continue;
        }
        // Platforms IGDB doesn't list are dropped; a game left with none is skipped
        const owned = g.platforms.filter(platformKnown);
        if (owned.length === 0) {
            report.games.skipped++;
            note(`${g.game.name} was skipped: none of its platforms are on IGDB`);
            continue;
        }
        const entry: ExportEntry = {
            ...g,
            platforms: owned,
            playthroughs: g.playthroughs.map((p) =>
                platformKnown(p.platform) ? p : { ...p, platform: null }
            )
        };
        entryIdByGame.set(
            g.igdbId,
            mergeGame(db, userId, entry, existing.get(g.igdbId), report, note, now)
        );
    }

    mergeLists(db, userId, file, entryIdByGame, catalog, report, note);
    mergeSmartLists(db, userId, file, report);
    mergeWishlist(db, userId, file, catalog, report, note, now);
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
                favorite: g.favorite ?? false,
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
        // Never un-favorites: a file can only add the mark
        if (g.favorite && !existing.favorite) set.favorite = true;
        if (Object.keys(set).length > 0) {
            db.update(entries)
                // A favorite mark alone isn't a change to the game (see patchEntry)
                .set(
                    Object.keys(set).every((k) => k === 'favorite')
                        ? set
                        : { ...set, updatedAt: now }
                )
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

    // Notes: add the ones you don't already have (same text = same note, whoever can read it)
    const fileNotes = [
        // Older files carried one text, which was always private
        ...(g.notes?.trim() ? [{ body: g.notes.trim(), public: false, createdAt: g.addedAt }] : []),
        ...(g.noteItems ?? [])
    ];
    if (fileNotes.length > 0) {
        const haveBodies = new Set(
            existing
                ? db
                      .select({ body: entryNotes.body })
                      .from(entryNotes)
                      .where(eq(entryNotes.entryId, entryId))
                      .all()
                      .map((r) => r.body)
                : []
        );
        const fresh = fileNotes.filter((n) => !haveBodies.has(n.body));
        const seen = new Set<string>();
        const rows = fresh
            .filter((n) => !seen.has(n.body) && seen.add(n.body))
            .map((n) => ({
                entryId,
                body: n.body,
                public: n.public,
                createdAt: n.createdAt || now,
                updatedAt: n.createdAt || now
            }));
        if (rows.length > 0) {
            db.insert(entryNotes).values(rows).run();
            if (existing) changed = true;
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
        const duplicate = current.find((c) => keyOf(c) === keyOf(row));
        if (duplicate || keys.has(keyOf(row))) {
            // Same playthrough: only fill in a play time you hadn't recorded
            if (duplicate && duplicate.playtimeMinutes === null && p.playtimeMinutes) {
                db.update(playthroughs)
                    .set({ playtimeMinutes: p.playtimeMinutes })
                    .where(eq(playthroughs.id, duplicate.id))
                    .run();
                duplicate.playtimeMinutes = p.playtimeMinutes;
                changed = true;
            }
            report.playthroughs.duplicates++;
            continue;
        }
        if (p.outcome === null && hasOpen) {
            report.playthroughs.skipped++;
            note(`${name}: skipped an in-progress playthrough because you already have one`);
            continue;
        }
        db.insert(playthroughs)
            .values({
                userId,
                entryId,
                ...row,
                rating: p.rating,
                playtimeMinutes: p.playtimeMinutes ?? null
            })
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
    catalog: ImportCatalog,
    report: ImportReport,
    note: (m: string) => void
) {
    const names = new Map([
        ...file.wishlist.map((w) => [w.igdbId, w.game.name] as const),
        ...file.games.map((g) => [g.igdbId, g.game.name] as const)
    ]);
    const nameOf = (gameId: number) => names.get(gameId) ?? `Game ${gameId}`;
    const byName = new Map<string, number>();
    const described = new Set<number>();
    for (const l of db
        .select()
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'list')))
        .orderBy(asc(lists.id))
        .all()) {
        if (!byName.has(lower(l.name))) byName.set(lower(l.name), l.id);
        if (l.description) described.add(l.id);
    }
    /** Adds the games not yet on the list to its end; returns how many went in */
    const append = (listId: number, gameIds: number[], accept: (gameId: number) => boolean) => {
        const present = new Set(
            db
                .select({ gameId: listItems.gameId })
                .from(listItems)
                .where(eq(listItems.listId, listId))
                .all()
                .map((r) => r.gameId)
        );
        let position =
            (db
                .select({ n: max(listItems.position) })
                .from(listItems)
                .where(eq(listItems.listId, listId))
                .get()!.n ?? -1) + 1;
        let added = 0;
        for (const gameId of new Set(gameIds)) {
            if (present.has(gameId) || !accept(gameId)) continue;
            db.insert(listItems).values({ listId, gameId, position: position++ }).run();
            present.add(gameId);
            added++;
        }
        return added;
    };
    for (const fl of file.lists) {
        let listId = byName.get(lower(fl.name));
        if (listId === undefined) {
            listId = db
                .insert(lists)
                .values({ userId, name: fl.name, description: fl.description })
                .returning({ id: lists.id })
                .get().id;
            byName.set(lower(fl.name), listId);
            report.lists.created++;
        } else if (fl.description && !described.has(listId)) {
            // Your own description wins; an empty one is filled
            db.update(lists).set({ description: fl.description }).where(eq(lists.id, listId)).run();
            described.add(listId);
        }
        // A list can hold games you don't own; only games IGDB doesn't know are left out (and noted)
        report.lists.itemsAdded += append(listId, fl.games, (gameId) =>
            knownGame(catalog, gameId, nameOf(gameId), note, `the list ${fl.name}`)
        );
    }

    // Queue: games already queued keep their place; new ones go on the end. Only games you own.
    if (file.queue.length > 0) {
        const queueId = ensureQueue(db, userId).id;
        report.queue.added += append(queueId, file.queue, (gameId) => entryIdByGame.has(gameId));
    }
}

/** Smart lists have no games of their own, so merging is by name: ones you have are left alone. */
function mergeSmartLists(db: Db, userId: number, file: ExportFile, report: ImportReport) {
    const have = new Set(
        db
            .select({ name: smartLists.name })
            .from(smartLists)
            .where(eq(smartLists.userId, userId))
            .all()
            .map((l) => lower(l.name))
    );
    for (const sl of file.smartLists) {
        if (have.has(lower(sl.name))) continue;
        db.insert(smartLists)
            .values({
                userId,
                name: sl.name,
                description: sl.description,
                rules: JSON.stringify(sl.rules),
                sort: sl.sort,
                dir: sl.dir
            })
            .run();
        have.add(lower(sl.name));
        report.smartLists.created++;
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
    catalog: ImportCatalog,
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
        if (!knownGame(catalog, w.igdbId, w.game.name, note, 'the wishlist')) continue;
        const platformId =
            w.platform && catalog.platforms.has(w.platform.id) ? w.platform.id : null;

        const have = present.get(w.igdbId);
        if (have) {
            const set: Partial<typeof wishlistItems.$inferInsert> = {};
            if (have.platformId === null && platformId !== null) set.platformId = platformId;
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
                platformId,
                note: w.note,
                addedAt: w.addedAt || now
            })
            .run();
        present.set(w.igdbId, {} as never);
        report.wishlist.added++;
    }
}
