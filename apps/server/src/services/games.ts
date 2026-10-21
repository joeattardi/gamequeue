import { asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { isReleased, type GameDto, type PlatformDto, type SeriesRefDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    gameGenres,
    gamePlatforms,
    games,
    gameSeries,
    series,
    gameThemes,
    genres,
    platforms,
    themes
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import { IgdbError, type GameRecord, type IgdbClient } from '../igdb/types.js';

export function requireIgdb(igdb: IgdbClient | undefined): IgdbClient {
    if (!igdb)
        throw new HttpError(
            503,
            "IGDB isn't configured. Set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET."
        );
    return igdb;
}

/** Wraps IGDB failures as 502 so they don't look like our own bugs. */
export async function callIgdb<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof IgdbError || (e instanceof Error && /Twitch token/.test(e.message))) {
            console.error(e);
            throw new HttpError(502, 'IGDB is unavailable right now. Try again shortly.');
        }
        throw e;
    }
}

/**
 * Inserts platforms into the shared list. By default IGDB's names win and update what we have;
 * `keepExisting` (used for user-supplied import files) never touches a row that already exists.
 */
export function upsertPlatforms(
    db: Db,
    list: PlatformDto[],
    opts: { keepExisting?: boolean } = {}
) {
    for (const p of list) {
        const insert = db.insert(platforms).values(p);
        if (opts.keepExisting) insert.onConflictDoNothing().run();
        else
            insert
                .onConflictDoUpdate({
                    target: platforms.id,
                    set: { name: p.name, abbreviation: p.abbreviation }
                })
                .run();
    }
}

/** Records which series a game is in (the series rows themselves are shared). */
function saveGameSeries(db: Db, gameId: number, list: SeriesRefDto[]) {
    for (const s of list)
        db.insert(series)
            .values({ id: s.id, name: s.name })
            .onConflictDoUpdate({ target: series.id, set: { name: s.name } })
            .run();
    if (list.length)
        db.insert(gameSeries)
            .values(list.map((s) => ({ gameId, seriesId: s.id })))
            .onConflictDoNothing()
            .run();
}

/** Writes a fetched game and its relations into the shared cache. */
export function saveGame(
    db: Db,
    g: GameRecord,
    now = Date.now(),
    opts: { keepExistingPlatforms?: boolean; fromImport?: boolean } = {}
) {
    db.transaction((tx) => {
        upsertPlatforms(tx as unknown as Db, g.platforms, {
            keepExisting: opts.keepExistingPlatforms
        });
        for (const x of g.genres) tx.insert(genres).values(x).onConflictDoNothing().run();
        for (const x of g.themes) tx.insert(themes).values(x).onConflictDoNothing().run();
        tx.insert(games)
            .values({
                id: g.id,
                name: g.name,
                slug: g.slug,
                summary: g.summary,
                releaseDate: g.releaseDate,
                releasePrecision: g.releasePrecision,
                // An import file is only a snapshot: its dates and series are due for a check
                releaseCheckedAt: opts.fromImport ? null : now,
                seriesCheckedAt: opts.fromImport ? null : now,
                coverImageId: g.coverImageId,
                // An import file carries no screenshots: they are fetched when the game is opened
                screenshots: opts.fromImport ? null : JSON.stringify(g.screenshots),
                igdbRating: g.igdbRating,
                igdbRatingCount: g.igdbRatingCount,
                gameType: g.gameType,
                ttbHastilySeconds: g.ttb?.hastilySeconds ?? null,
                ttbNormallySeconds: g.ttb?.normallySeconds ?? null,
                ttbCompletelySeconds: g.ttb?.completelySeconds ?? null,
                ttbCount: g.ttb?.count ?? null,
                fetchedAt: now
            })
            .onConflictDoNothing()
            .run();
        // Drizzle rejects empty inserts, and IGDB games often lack themes/genres/platforms
        saveGameSeries(tx as unknown as Db, g.id, g.series);
        if (g.platforms.length)
            tx.insert(gamePlatforms)
                .values(g.platforms.map((p) => ({ gameId: g.id, platformId: p.id })))
                .onConflictDoNothing()
                .run();
        if (g.genres.length)
            tx.insert(gameGenres)
                .values(g.genres.map((x) => ({ gameId: g.id, genreId: x.id })))
                .onConflictDoNothing()
                .run();
        if (g.themes.length)
            tx.insert(gameThemes)
                .values(g.themes.map((x) => ({ gameId: g.id, themeId: x.id })))
                .onConflictDoNothing()
                .run();
    });
}

/**
 * Returns the cached game, fetching from IGDB only if we've never seen it.
 * Cached metadata is never re-fetched.
 */
export async function ensureGame(db: Db, igdb: IgdbClient | undefined, igdbId: number) {
    const cached = db.select({ id: games.id }).from(games).where(eq(games.id, igdbId)).get();
    if (cached) return;
    const record = await callIgdb(() => requireIgdb(igdb).fetchGame(igdbId));
    if (!record) throw new HttpError(404, "That game wasn't found on IGDB");
    saveGame(db, record);
}

/**
 * Makes sure a cached game has its screenshots, asking IGDB once for games cached before they were
 * stored (or saved from an import file). Best effort: a failure just leaves the gallery empty until
 * the next visit. Returns whether anything was stored.
 */
export async function ensureScreenshots(
    db: Db,
    igdb: IgdbClient | undefined,
    igdbId: number
): Promise<boolean> {
    if (!igdb) return false;
    const row = db
        .select({ screenshots: games.screenshots })
        .from(games)
        .where(eq(games.id, igdbId))
        .get();
    if (!row || row.screenshots !== null) return false;
    try {
        const ids = await igdb.fetchScreenshots(igdbId);
        db.update(games)
            .set({ screenshots: JSON.stringify(ids ?? []) })
            .where(eq(games.id, igdbId))
            .run();
        return true;
    } catch (e) {
        console.error('Screenshot fetch failed', e);
        return false;
    }
}

let backfilling = false;

/**
 * Asks IGDB which series each cached game is in, for games cached before series were stored (or
 * saved from an import file). One request per 100 games; games IGDB doesn't return count as
 * checked. Best effort: a failure leaves the rest for the next run, and only one run goes at a time.
 */
export async function backfillSeries(db: Db, igdb: IgdbClient | undefined, now = Date.now()) {
    if (!igdb || backfilling) return;
    backfilling = true;
    try {
        const due = db
            .select({ id: games.id })
            .from(games)
            .where(isNull(games.seriesCheckedAt))
            .all()
            .map((g) => g.id);
        for (let i = 0; i < due.length; i += 100) {
            const ids = due.slice(i, i + 100);
            const found = await igdb.fetchGameSeries(ids);
            db.transaction((tx) => {
                for (const f of found) saveGameSeries(tx as unknown as Db, f.id, f.series);
                tx.update(games).set({ seriesCheckedAt: now }).where(inArray(games.id, ids)).run();
            });
        }
    } catch (e) {
        console.error('Series backfill failed', e);
    } finally {
        backfilling = false;
    }
}

/** A release date is only worth asking IGDB about again after this long. */
export const RELEASE_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Re-reads the release date of cached games that haven't come out yet (announced, delayed or still
 * TBA), at most once a day each, in one IGDB request. Released games never change, so they are
 * skipped. Best effort: an IGDB failure leaves the cached dates alone and is not an error.
 */
export async function refreshReleaseDates(
    db: Db,
    igdb: IgdbClient | undefined,
    gameIds: number[],
    now = Date.now()
) {
    if (!igdb || gameIds.length === 0) return;
    const today = new Date(now).toISOString().slice(0, 10);
    const due = db
        .select()
        .from(games)
        .where(inArray(games.id, gameIds))
        .all()
        .filter(
            (g) =>
                (g.releaseCheckedAt === null || g.releaseCheckedAt < now - RELEASE_REFRESH_MS) &&
                !isReleased(g.releaseDate, g.releasePrecision, today)
        )
        .map((g) => g.id);
    if (due.length === 0) return;
    try {
        const fresh = await igdb.fetchReleaseDates(due);
        db.transaction((tx) => {
            for (const r of fresh)
                tx.update(games)
                    .set({
                        releaseDate: r.releaseDate,
                        releasePrecision: r.releasePrecision,
                        releaseCheckedAt: now
                    })
                    .where(eq(games.id, r.id))
                    .run();
            // Games IGDB no longer returns still count as checked, so they aren't asked about daily
            const seen = new Set(fresh.map((r) => r.id));
            const gone = due.filter((id) => !seen.has(id));
            if (gone.length)
                tx.update(games)
                    .set({ releaseCheckedAt: now })
                    .where(inArray(games.id, gone))
                    .run();
        });
    } catch (e) {
        console.error('Release date refresh failed', e);
    }
}

/** Platform list for pickers. Synced from IGDB once, then served from the DB. */
export async function listPlatforms(db: Db, igdb: IgdbClient | undefined): Promise<PlatformDto[]> {
    const count = db
        .select({ n: sql<number>`count(*)` })
        .from(platforms)
        .get()!.n;
    // A handful of rows means only games' own platforms have been cached so far; do the full sync once.
    if (count < 50 && igdb) {
        const all = await callIgdb(() => igdb.fetchPlatforms());
        db.transaction((tx) => upsertPlatforms(tx as unknown as Db, all));
    }
    return db
        .select()
        .from(platforms)
        .orderBy(sql`lower(${platforms.name})`)
        .all();
}

export const existingPlatformIds = (db: Db, ids: number[]) =>
    new Set(
        db
            .select({ id: platforms.id })
            .from(platforms)
            .where(inArray(platforms.id, ids))
            .all()
            .map((r) => r.id)
    );

const minutes = (s: number | null) => (s === null ? null : Math.round(s / 60));

/** Loads the shared-cache `GameDto` for each given game id (a few queries, however many games). */
export function loadGames(db: Db, gameIds: number[]): Map<number, GameDto> {
    const out = new Map<number, GameDto>();
    if (gameIds.length === 0) return out;
    const gPlatforms = new Map<number, PlatformDto[]>();
    const gGenres = new Map<number, string[]>();
    const gThemes = new Map<number, string[]>();
    const gSeries = new Map<number, SeriesRefDto[]>();
    const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
    const rows: (typeof games.$inferSelect)[] = [];
    for (let i = 0; i < gameIds.length; i += 500) {
        const chunk = gameIds.slice(i, i + 500);
        rows.push(...db.select().from(games).where(inArray(games.id, chunk)).all());
        for (const r of db
            .select({ gameId: gamePlatforms.gameId, p: platforms })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(platforms.id, gamePlatforms.platformId))
            .where(inArray(gamePlatforms.gameId, chunk))
            .orderBy(asc(platforms.name))
            .all())
            push(gPlatforms, r.gameId, r.p);
        for (const r of db
            .select({ gameId: gameGenres.gameId, name: genres.name })
            .from(gameGenres)
            .innerJoin(genres, eq(genres.id, gameGenres.genreId))
            .where(inArray(gameGenres.gameId, chunk))
            .orderBy(asc(genres.name))
            .all())
            push(gGenres, r.gameId, r.name);
        for (const r of db
            .select({ gameId: gameSeries.gameId, id: series.id, name: series.name })
            .from(gameSeries)
            .innerJoin(series, eq(series.id, gameSeries.seriesId))
            .where(inArray(gameSeries.gameId, chunk))
            .orderBy(asc(series.name))
            .all())
            push(gSeries, r.gameId, { id: r.id, name: r.name });
        for (const r of db
            .select({ gameId: gameThemes.gameId, name: themes.name })
            .from(gameThemes)
            .innerJoin(themes, eq(themes.id, gameThemes.themeId))
            .where(inArray(gameThemes.gameId, chunk))
            .orderBy(asc(themes.name))
            .all())
            push(gThemes, r.gameId, r.name);
    }
    for (const g of rows) {
        const hasTtb =
            g.ttbHastilySeconds !== null ||
            g.ttbNormallySeconds !== null ||
            g.ttbCompletelySeconds !== null;
        out.set(g.id, {
            id: g.id,
            name: g.name,
            slug: g.slug,
            summary: g.summary,
            releaseDate: g.releaseDate,
            releasePrecision: g.releasePrecision,
            coverImageId: g.coverImageId,
            screenshots: g.screenshots ? (JSON.parse(g.screenshots) as string[]) : [],
            igdbRating: g.igdbRating,
            series: gSeries.get(g.id) ?? [],
            genres: gGenres.get(g.id) ?? [],
            themes: gThemes.get(g.id) ?? [],
            platforms: gPlatforms.get(g.id) ?? [],
            ttb: hasTtb
                ? {
                      hastily: minutes(g.ttbHastilySeconds),
                      normally: minutes(g.ttbNormallySeconds),
                      completely: minutes(g.ttbCompletelySeconds),
                      count: g.ttbCount ?? 0
                  }
                : null
        });
    }
    return out;
}
