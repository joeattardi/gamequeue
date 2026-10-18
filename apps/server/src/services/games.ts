import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { GameDto, PlatformDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    gameGenres,
    gamePlatforms,
    games,
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

/** Writes a fetched game and its relations into the shared cache. */
export function saveGame(
    db: Db,
    g: GameRecord,
    now = Date.now(),
    opts: { keepExistingPlatforms?: boolean } = {}
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
                coverImageId: g.coverImageId,
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
            coverImageId: g.coverImageId,
            igdbRating: g.igdbRating,
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
