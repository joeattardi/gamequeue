import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    errorEvents,
    gameGenres,
    gamePlatforms,
    games,
    gameSeries,
    gameThemes,
    series,
    seriesMembers,
    settings
} from '../src/db/schema.js';
import { openDb } from '../src/db/client.js';
import type { IgdbClient } from '../src/igdb/types.js';
import { createMirrorIgdbClient, MirrorHandle } from '../src/mirror/client.js';
import { runMirror } from '../src/mirror/run.js';
import { saveGame } from '../src/services/games.js';
import { syncCachedGames, syncFromMirrorIfNew } from '../src/services/mirror-sync.js';
import { fakeGame, makeApp, cookieFrom, register, PS5 } from './helpers.js';
import { fakeSource, GAMES } from './mirror-fixtures.js';

let dir: string;
let path: string;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mirror-sync-'));
    path = join(dir, 'igdb.db');
    await runMirror({ source: fakeSource(), path, minGames: 1 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const mirrorClient = (mirrorPath = path, handle?: MirrorHandle) =>
    createMirrorIgdbClient({ path: mirrorPath, handle });
const local = (client: IgdbClient) => () => client.local!();

/** A cached copy of Hades as an older fetch left it. */
const staleHades = () =>
    fakeGame(1, 'Old Hades', {
        slug: 'old-hades',
        summary: 'old summary',
        releaseDate: '2019-01-01',
        releasePrecision: 'year',
        igdbRating: 10,
        igdbRatingCount: 1,
        platforms: [PS5],
        genres: [{ id: 99, name: 'Old genre' }],
        themes: [],
        series: [],
        screenshots: ['old'],
        ttb: null
    });

const rows = {
    game: (db: ReturnType<typeof openDb>, id: number) =>
        db.select().from(games).where(eq(games.id, id)).get()!,
    ids: <T extends { n: number }>(list: T[]) => list.map((r) => r.n).sort((a, b) => a - b)
};

describe('syncCachedGames', () => {
    it('replaces a cached game with the mirror copy, relations included', async () => {
        const db = openDb(':memory:');
        saveGame(db, staleHades(), 1000);
        const result = await syncCachedGames(db, local(mirrorClient()), { now: 5000 });
        expect(result.games).toBe(1);

        expect(rows.game(db, 1)).toMatchObject({
            name: 'Hades',
            slug: 'hades',
            summary: 'Fight, "out"\nof hell',
            releaseDate: '2020-09-17',
            releasePrecision: 'day',
            coverImageId: 'co_hades',
            igdbRating: 91,
            igdbRatingCount: 500,
            gameType: 'Main Game',
            ttbNormallySeconds: 7200,
            ttbCount: 12,
            releaseCheckedAt: 5000,
            seriesCheckedAt: 5000,
            fetchedAt: 5000
        });
        expect(JSON.parse(rows.game(db, 1).screenshots!)).toEqual([
            's1',
            's2',
            's3',
            's4',
            's5',
            's6'
        ]);
        // Platforms, genres, themes and series become exactly the mirror's, not a union with the old
        expect(
            rows.ids(
                db
                    .select({ n: gamePlatforms.platformId })
                    .from(gamePlatforms)
                    .where(eq(gamePlatforms.gameId, 1))
                    .all()
            )
        ).toEqual([6, 130]);
        expect(
            rows.ids(
                db
                    .select({ n: gameGenres.genreId })
                    .from(gameGenres)
                    .where(eq(gameGenres.gameId, 1))
                    .all()
            )
        ).toEqual([12]);
        expect(
            rows.ids(
                db
                    .select({ n: gameThemes.themeId })
                    .from(gameThemes)
                    .where(eq(gameThemes.gameId, 1))
                    .all()
            )
        ).toEqual([31]);
        expect(
            rows.ids(
                db
                    .select({ n: gameSeries.seriesId })
                    .from(gameSeries)
                    .where(eq(gameSeries.gameId, 1))
                    .all()
            )
        ).toEqual([100]);
    });

    it('leaves a cached game the mirror does not have exactly as it was', async () => {
        const db = openDb(':memory:');
        saveGame(db, fakeGame(5000, 'Newer Than The Dump'), 1000);
        const before = rows.game(db, 5000);
        const result = await syncCachedGames(db, local(mirrorClient()));
        expect(result.games).toBe(0);
        expect(rows.game(db, 5000)).toEqual(before);
    });

    it('refreshes the member lists of series pages that are cached, and only those', async () => {
        const db = openDb(':memory:');
        db.insert(series).values({ id: 100, name: 'Old name', membersFetchedAt: 1 }).run();
        db.insert(seriesMembers)
            .values({ seriesId: 100, gameId: 777, name: 'Cancelled sequel' })
            .run();
        db.insert(series).values({ id: 55, name: 'Never opened' }).run();

        const result = await syncCachedGames(db, local(mirrorClient()), { now: 9000 });
        expect(result.series).toBe(1);
        expect(db.select().from(series).where(eq(series.id, 100)).get()).toMatchObject({
            name: 'Hades Series',
            membersFetchedAt: 9000
        });
        expect(
            db
                .select({ n: seriesMembers.gameId })
                .from(seriesMembers)
                .where(eq(seriesMembers.seriesId, 100))
                .all()
                .map((r) => r.n)
                .sort((a, b) => a - b)
        ).toEqual([1, 9]);
        expect(
            db.select().from(series).where(eq(series.id, 55)).get()?.membersFetchedAt
        ).toBeNull();
    });

    it('takes the platform list from the mirror', async () => {
        const db = openDb(':memory:');
        await syncCachedGames(db, local(mirrorClient()));
        const names = db
            .select()
            .from(await import('../src/db/schema.js').then((m) => m.platforms))
            .all()
            .map((p) => p.name)
            .sort();
        expect(names).toEqual(['Nintendo Switch', 'PC (Microsoft Windows)']);
    });

    it('does nothing when the mirror disappears', async () => {
        const db = openDb(':memory:');
        saveGame(db, staleHades(), 1000);
        const result = await syncCachedGames(db, () => null);
        expect(result).toEqual({ games: 0, series: 0 });
        expect(rows.game(db, 1).name).toBe('Old Hades');
    });

    it('works through more games than one batch', async () => {
        const db = openDb(':memory:');
        for (let id = 1000; id < 1450; id++) saveGame(db, fakeGame(id, `Game ${id}`), 1000);
        saveGame(db, staleHades(), 1000);
        const result = await syncCachedGames(db, local(mirrorClient()));
        expect(result.games).toBe(1); // 450 unknown to the mirror, one known
        expect(rows.game(db, 1).name).toBe('Hades');
    });

    it("keeps a user's own data and picks up the new metadata through the API", async () => {
        const client = mirrorClient();
        const { app, db } = makeApp({}, client);
        const cookie = cookieFrom(await register(app));
        const headers = {
            origin: 'http://localhost',
            cookie,
            'content-type': 'application/json'
        };
        const add = await app.request('/api/entries', {
            method: 'POST',
            headers,
            body: JSON.stringify({ igdbId: 4, platformIds: [6] })
        });
        expect(add.status).toBe(201);
        const { entry } = (await add.json()) as { entry: { id: number } };
        await app.request(`/api/entries/${entry.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ rating: 5 })
        });

        // The cache falls behind (an old fetch), then the mirror brings it up to date
        db.update(games)
            .set({ name: 'Tunic (old title)', igdbRating: 1 })
            .where(eq(games.id, 4))
            .run();
        await syncCachedGames(db, local(client));

        const got = await app.request(`/api/entries/${entry.id}`, { headers });
        const body = (await got.json()) as {
            entry: { rating: number; game: { name: string; igdbRating: number } };
        };
        expect(body.entry.game).toMatchObject({ name: 'Tunic', igdbRating: 89 });
        expect(body.entry.rating).toBe(5);
    });
});

describe('syncFromMirrorIfNew', () => {
    const syncedDump = (db: ReturnType<typeof openDb>) =>
        db.select().from(settings).where(eq(settings.key, 'igdb_mirror_synced_dump')).get()?.value;

    it('syncs once per dump, and again when the mirror is rebuilt', async () => {
        const livePath = join(dir, 'rebuilt.db');
        await runMirror({ source: fakeSource(), path: livePath, minGames: 1 });
        const handle = new MirrorHandle(livePath, { checkEveryMs: 0 });
        const client = mirrorClient(livePath, handle);
        const db = openDb(':memory:');
        saveGame(db, staleHades(), 1000);

        expect(await syncFromMirrorIfNew(db, client)).toEqual({ games: 1, series: 0 });
        expect(syncedDump(db)).toBe('1700000000_games.csv');
        expect(rows.game(db, 1).name).toBe('Hades');

        // Same dump: nothing to do, even if the cache has drifted since
        db.update(games).set({ name: 'Drifted' }).where(eq(games.id, 1)).run();
        expect(await syncFromMirrorIfNew(db, client)).toBeNull();
        expect(rows.game(db, 1).name).toBe('Drifted');

        // A newer dump arrives (renamed into place by the daily build)
        const renamed = GAMES.replace('1,Hades,hades', '1,Hades Remastered,hades');
        await runMirror({
            source: fakeSource({ games: renamed }, '1700086400_games.csv'),
            path: livePath,
            minGames: 1
        });
        expect(await syncFromMirrorIfNew(db, client)).toMatchObject({ games: 1 });
        expect(rows.game(db, 1).name).toBe('Hades Remastered');
        expect(syncedDump(db)).toBe('1700086400_games.csv');
        handle.close();
    });

    it('does nothing without a mirror', async () => {
        const db = openDb(':memory:');
        const none = mirrorClient(join(dir, 'missing.db'));
        expect(await syncFromMirrorIfNew(db, none)).toBeNull();
        expect(await syncFromMirrorIfNew(db, undefined)).toBeNull();
        expect(syncedDump(db)).toBeUndefined();
    });

    it('records a failure, keeps the dump unmarked so it is tried again, and recovers', async () => {
        const db = openDb(':memory:');
        saveGame(db, staleHades(), 1000);
        const real = mirrorClient();
        let broken = true;
        const flaky: IgdbClient = {
            ...real,
            local: () => {
                const l = real.local!();
                if (!l) return null;
                return {
                    ...l,
                    dump: () => l.dump(),
                    game: (id) => {
                        if (broken) throw new Error('disk error');
                        return l.game(id);
                    },
                    seriesRecord: (id) => l.seriesRecord(id),
                    platforms: () => l.platforms(),
                    showcase: (n) => l.showcase(n)
                };
            }
        };
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

        expect(await syncFromMirrorIfNew(db, flaky)).toBeNull();
        expect(syncedDump(db)).toBeUndefined();
        expect(db.select().from(errorEvents).all()).toMatchObject([
            { kind: 'job_mirror_sync', message: 'disk error' }
        ]);

        broken = false;
        expect(await syncFromMirrorIfNew(db, flaky)).toMatchObject({ games: 1 });
        expect(rows.game(db, 1).name).toBe('Hades');
        spy.mockRestore();
    });
});
