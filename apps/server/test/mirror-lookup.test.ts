import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IgdbClient } from '../src/igdb/types.js';
import { createMirrorIgdbClient, MirrorHandle } from '../src/mirror/client.js';
import { ftsPhrases, ftsQuery } from '../src/mirror/reader.js';
import { runMirror } from '../src/mirror/run.js';
import { fakeGame, PC } from './helpers.js';
import { fakeSource, GAMES } from './mirror-fixtures.js';

let dir: string;
let path: string;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mirror-lookup-'));
    path = join(dir, 'igdb.db');
    await runMirror({ source: fakeSource(), path, minGames: 1 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A live client that fails the test if it is asked for anything unless a test says otherwise. */
function liveClient(overrides: Partial<IgdbClient> = {}): IgdbClient {
    const never = (name: string) => () => {
        throw new Error(`live IGDB should not be asked: ${name}`);
    };
    return {
        search: never('search'),
        fetchGame: never('fetchGame'),
        fetchGames: never('fetchGames'),
        fetchPlatforms: never('fetchPlatforms'),
        fetchReleaseDates: never('fetchReleaseDates'),
        fetchGameSeries: never('fetchGameSeries'),
        fetchScreenshots: never('fetchScreenshots'),
        fetchSeries: never('fetchSeries'),
        fetchSimilarGames: never('fetchSimilarGames'),
        ...overrides
    };
}

const client = (fallback?: IgdbClient) => createMirrorIgdbClient({ path, fallback });

describe('ftsQuery', () => {
    it('requires every word and treats the last as a prefix', () => {
        expect(ftsQuery('witcher wild')).toBe('"witcher" AND "wild"*');
        expect(ftsQuery("  Assassin's  Creed ")).toBe('"Assassins" AND "Creed"*');
        expect(ftsQuery('hades')).toBe('"hades"*');
    });

    it('describes a search as phrases, one per numeral spelling', () => {
        expect(ftsPhrases('portal 2')).toBe('("portal 2" OR "portal ii")');
        expect(ftsPhrases('final fantasy 7')).toBe('("final fantasy 7" OR "final fantasy vii")');
        expect(ftsPhrases('hades')).toBe('("hades" *)');
        expect(ftsPhrases('!!')).toBeNull();
    });

    it('drops apostrophes, as the index does', () => {
        expect(ftsQuery("baldur's gate")).toBe('"baldurs" AND "gate"*');
        expect(ftsQuery('baldur’s')).toBe('"baldurs"*');
    });

    it('matches a sequel number as its Roman numeral too, whole', () => {
        expect(ftsQuery('final fantasy 7')).toBe('"final" AND "fantasy" AND ("7" OR "vii")');
        expect(ftsQuery('Final Fantasy VII')).toBe('"Final" AND "Fantasy" AND ("VII" OR "7")');
        expect(ftsQuery('hades 2')).toBe('"hades" AND ("2" OR "ii")');
        // Too ambiguous or too big to be a sequel number
        expect(ftsQuery('x 1 21')).toBe('"x" AND "1" AND "21"*');
    });

    it('drops punctuation and FTS syntax, so user text can never break the query', () => {
        expect(ftsQuery('"hades" OR NOT (x*)')).toBe('"hades" AND "OR" AND "NOT" AND "x"*');
        expect(ftsQuery('!!!')).toBeNull();
        expect(ftsQuery('')).toBeNull();
    });
});

describe('search', () => {
    it('ranks an exact name first, then by popularity', async () => {
        const hits = await client().search('hades');
        // "Hades" (500 ratings) before "Hades II" (100); the DLC and the edition are not offered
        expect(hits.map((h) => h.id)).toEqual([1, 9]);

        const witcher = await client().search('witcher');
        expect(witcher.map((h) => h.id)).toEqual([7, 13, 8]); // by number of ratings: 5000, 3000, 10
    });

    it('puts a title with the typed words side by side above one that only has them somewhere', async () => {
        // "Wild Witcher" has 3000 ratings and "The Witcher 3: Wild Hunt" 5000, but the latter has the
        // words in the other order and counts a tenth
        expect((await client().search('wild witcher')).map((h) => h.id)).toEqual([13, 7]);
    });

    it('recognises an exact name through hyphens, colons and apostrophes', async () => {
        // "Half-Life" (50 ratings, x20) beats "Half-Life 2" (400)
        expect((await client().search('half life')).map((h) => h.id)).toEqual([14, 15]);
        expect((await client().search('Half-Life')).map((h) => h.id)).toEqual([14, 15]);
    });

    it('gives an exact name a boost, not first place regardless of popularity', async () => {
        // "Witcher Tales" (10 ratings) is typed exactly, but 5000 ratings is more than 20x as many
        expect((await client().search('witcher tales')).map((h) => h.id)).toEqual([8]);
        const dir2 = mkdtempSync(join(tmpdir(), 'mirror-exact-'));
        const path2 = join(dir2, 'igdb.db');
        const games = GAMES.concat(
            '\n20,Final,final,,,0,,,,,3,,,,,\n21,Final Heaven Online,final-heaven,,,0,,,,,100,,,,,'
        );
        await runMirror({ source: fakeSource({ games }), path: path2, minGames: 1 });
        const hits = await createMirrorIgdbClient({ path: path2 }).search('final');
        // "Final" (3 ratings, exact, x20 = 80) loses to "Final Fantasy VII" (900) but beats "Final Heaven Online" (100 vs 4*20)
        expect(hits.map((h) => h.id).slice(0, 4)).toEqual([11, 12, 21, 20]);
        rmSync(dir2, { recursive: true, force: true });
    });

    it('finds games by abbreviation through their alternative names', async () => {
        const c = client();
        expect((await c.search('ff7')).map((h) => h.id)).toEqual([11]);
        expect((await c.search('FFVII')).map((h) => h.id)).toEqual([11]);
        expect((await c.search('bg3')).map((h) => h.id)).toEqual([10]);
        expect((await c.search('tunica')).map((h) => h.id)).toEqual([4]);
    });

    it('finds "Baldur\'s Gate III" without the apostrophe and with either number', async () => {
        const c = client();
        for (const q of ["baldur's gate 3", 'baldurs gate 3', 'Baldurs Gate III', 'baldurs'])
            expect((await c.search(q)).map((h) => h.id)).toEqual([10]);
    });

    it('treats 7 and VII as the same sequel but not VII and VIII', async () => {
        const c = client();
        expect((await c.search('final fantasy 7')).map((h) => h.id)).toEqual([11]);
        expect((await c.search('final fantasy viii')).map((h) => h.id)).toEqual([12]);
        expect((await c.search('hades 2')).map((h) => h.id)).toEqual([9]);
    });

    it('matches word prefixes, accents and punctuation like type-ahead does', async () => {
        const c = client();
        expect((await c.search('witcher 3')).map((h) => h.id)).toEqual([7]);
        expect((await c.search('tun')).map((h) => h.id)).toEqual([4]);
        expect((await c.search('The Witcher 3: Wild')).map((h) => h.id)).toEqual([7]);
        expect((await c.search('HADES   ii')).map((h) => h.id)).toEqual([9]);
    });

    it('returns the shape of a live search hit', async () => {
        const [hit] = await client().search('hades');
        expect(hit).toEqual({
            id: 1,
            name: 'Hades',
            year: 2020,
            coverImageId: 'co_hades',
            rating: 91,
            platforms: [
                { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
                { id: 130, name: 'Nintendo Switch', abbreviation: null }
            ]
        });
        const [future] = await client().search('future');
        expect(future).toMatchObject({ year: null, coverImageId: null, rating: null });
    });

    it('does not ask live IGDB when the mirror has hits', async () => {
        const search = vi.fn();
        await client(liveClient({ search })).search('hades');
        expect(search).not.toHaveBeenCalled();
    });

    it('asks live IGDB when the mirror has no hit (typos, newer games)', async () => {
        const live = [
            { id: 99, name: 'Witcher', year: 2007, coverImageId: null, rating: null, platforms: [] }
        ];
        const search = vi.fn().mockResolvedValue(live);
        expect(await client(liveClient({ search })).search('witcer')).toEqual(live);
        expect(search).toHaveBeenCalledWith('witcer');
        // Nothing searchable in the text at all
        await client(liveClient({ search })).search('!!!');
        expect(search).toHaveBeenCalledWith('!!!');
    });

    it('returns nothing without a live client when the mirror has no hit', async () => {
        expect(await client().search('zzzz')).toEqual([]);
    });
});

describe('fetchGame', () => {
    it('builds the same record the live client does', async () => {
        expect(await client().fetchGame(1)).toEqual({
            id: 1,
            name: 'Hades',
            slug: 'hades',
            summary: 'Fight, "out"\nof hell',
            releaseDate: '2020-09-17',
            releasePrecision: 'day',
            series: [{ id: 100, name: 'Hades Series' }],
            screenshots: ['s1', 's2', 's3', 's4', 's5', 's6'],
            coverImageId: 'co_hades',
            igdbRating: 91,
            igdbRatingCount: 500,
            gameType: 'Main Game',
            platforms: [
                { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
                { id: 130, name: 'Nintendo Switch', abbreviation: null }
            ],
            genres: [{ id: 12, name: 'Role-playing (RPG)' }],
            themes: [{ id: 31, name: 'Drama' }],
            ttb: {
                hastilySeconds: 3600,
                normallySeconds: 7200,
                completelySeconds: 10800,
                count: 12
            }
        });
    });

    it('still serves editions and add-ons, which search hides', async () => {
        expect((await client().fetchGame(3))?.name).toBe('Hades (Deluxe)');
        expect((await client().fetchGame(2))?.gameType).toBe('DLC');
    });

    it('leaves out a time to beat IGDB has no values for', async () => {
        expect((await client().fetchGame(4))?.ttb).toBeNull();
    });

    it('falls back to live IGDB for a game the mirror does not have', async () => {
        const game = fakeGame(5000, 'Brand New', { platforms: [PC] });
        const fetchGame = vi.fn().mockResolvedValue(game);
        expect(await client(liveClient({ fetchGame })).fetchGame(5000)).toBe(game);
        expect(await client().fetchGame(5000)).toBeNull();
    });

    it('fetches many games locally and asks live IGDB only for the ones it lacks', async () => {
        const game = fakeGame(5000, 'Brand New', { platforms: [PC] });
        const fetchGames = vi.fn().mockResolvedValue([game]);
        const out = await client(liveClient({ fetchGames })).fetchGames([1, 4, 5000, 5001]);
        expect(out.map((g) => g.id)).toEqual([1, 4, 5000]);
        expect(fetchGames).toHaveBeenCalledWith([5000, 5001]);
        expect((await client().fetchGames([1, 5001])).map((g) => g.id)).toEqual([1]);
    });
});

describe('release dates and series per game', () => {
    it('answers known ids locally and asks live IGDB only for the rest', async () => {
        const fetchReleaseDates = vi
            .fn()
            .mockResolvedValue([{ id: 5000, releaseDate: '2030-01-01', releasePrecision: 'year' }]);
        const out = await client(liveClient({ fetchReleaseDates })).fetchReleaseDates([1, 5, 5000]);
        expect(fetchReleaseDates).toHaveBeenCalledWith([5000]);
        expect(out).toEqual(
            expect.arrayContaining([
                { id: 1, releaseDate: '2020-09-17', releasePrecision: 'day' },
                { id: 5, releaseDate: null, releasePrecision: null }, // TBD
                { id: 5000, releaseDate: '2030-01-01', releasePrecision: 'year' }
            ])
        );
        expect(out).toHaveLength(3);
    });

    it('does not call live IGDB when everything is known', async () => {
        const out = await client(liveClient()).fetchGameSeries([1, 4]);
        expect(out).toEqual([
            { id: 1, series: [{ id: 100, name: 'Hades Series' }] },
            { id: 4, series: [] }
        ]);
    });

    it('leaves unknown ids out without a live client', async () => {
        expect(await client().fetchReleaseDates([4, 12345])).toEqual([
            { id: 4, releaseDate: '2022-03-16', releasePrecision: 'month' }
        ]);
    });
});

describe('screenshots, series and similar games', () => {
    it('gives the screenshots, or [] for a game without any', async () => {
        const c = client(liveClient());
        expect(await c.fetchScreenshots(4)).toEqual(['s9']);
        expect(await c.fetchScreenshots(8)).toEqual([]);
    });

    it('asks live IGDB for the screenshots of an unknown game', async () => {
        const fetchScreenshots = vi.fn().mockResolvedValue(['live']);
        expect(await client(liveClient({ fetchScreenshots })).fetchScreenshots(5000)).toEqual([
            'live'
        ]);
        expect(await client().fetchScreenshots(5000)).toBeNull();
    });

    it('lists a series by its main games only, oldest first', async () => {
        // 2 is a DLC and 3 an edition; 1 and 9 are main games
        expect(await client(liveClient()).fetchSeries(100)).toEqual({
            id: 100,
            name: 'Hades Series',
            games: [
                {
                    id: 1,
                    name: 'Hades',
                    coverImageId: 'co_hades',
                    releaseDate: '2020-09-17',
                    releasePrecision: 'day'
                },
                {
                    id: 9,
                    name: 'Hades II',
                    coverImageId: null,
                    releaseDate: '2025-05-06',
                    releasePrecision: null
                }
            ]
        });
    });

    it('asks live IGDB for a series it does not have', async () => {
        const fetchSeries = vi.fn().mockResolvedValue(null);
        await client(liveClient({ fetchSeries })).fetchSeries(777);
        expect(fetchSeries).toHaveBeenCalledWith(777);
    });

    it('keeps IGDB order and drops add-ons, editions and unknown ids from similar games', async () => {
        // The list is [DLC 2, edition 3, Witcher 7, Hades II 9, unknown 999, Tunic 4]
        const hits = await client(liveClient()).fetchSimilarGames(1);
        expect(hits.map((h) => h.id)).toEqual([7, 9, 4]);
        expect(hits[0]).toMatchObject({ name: 'The Witcher 3: Wild Hunt', year: 2015, rating: 92 });
    });

    it('has no similar games for a game that lists none, and asks live IGDB for an unknown one', async () => {
        expect(await client(liveClient()).fetchSimilarGames(4)).toEqual([]);
        const fetchSimilarGames = vi.fn().mockResolvedValue([]);
        await client(liveClient({ fetchSimilarGames })).fetchSimilarGames(5000);
        expect(fetchSimilarGames).toHaveBeenCalledWith(5000);
    });
});

describe('platforms', () => {
    it('serves the mirrored platform table', async () => {
        expect(await client(liveClient()).fetchPlatforms()).toEqual([
            { id: 130, name: 'Nintendo Switch', abbreviation: null },
            { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }
        ]);
    });
});

describe('live connection reporting', () => {
    it('hands status and ping to the live client, and has none without one', async () => {
        const ping = vi.fn().mockResolvedValue({ ok: true, ms: 1, error: null });
        const c = client(liveClient({ ping }));
        await c.ping!();
        expect(ping).toHaveBeenCalled();
        expect(c.status).toBeUndefined();
        expect(client().ping).toBeUndefined();
    });
});

describe('the mirror file', () => {
    it('behaves as if there is no mirror when the file is missing', async () => {
        const fetchGame = vi.fn().mockResolvedValue(null);
        const search = vi.fn().mockResolvedValue([]);
        const c = createMirrorIgdbClient({
            path: join(dir, 'nope.db'),
            fallback: liveClient({ fetchGame, search })
        });
        await c.fetchGame(1);
        await c.search('hades');
        expect(fetchGame).toHaveBeenCalledWith(1);
        expect(search).toHaveBeenCalledWith('hades');
    });

    it('ignores a file with another schema version, and says so', async () => {
        const bad = join(dir, 'old.db');
        copyFileSync(path, bad);
        const db = new Database(bad);
        db.prepare("UPDATE meta SET value = '99' WHERE key = 'schema_version'").run();
        db.close();
        const warn = vi.fn();
        const handle = new MirrorHandle(bad, { warn });
        expect(handle.get()).toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('schema version 99'));
        handle.close();
    });

    it('ignores a file that is not a database', async () => {
        const junk = join(dir, 'junk.db');
        const { writeFileSync } = await import('node:fs');
        writeFileSync(junk, 'not sqlite');
        const warn = vi.fn();
        const handle = new MirrorHandle(junk, { warn });
        expect(handle.get()).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
    });
});

describe('a rebuilt mirror', () => {
    let livePath: string;
    let now: number;
    beforeEach(() => {
        livePath = join(dir, `live-${Math.random().toString(36).slice(2)}.db`);
        copyFileSync(path, livePath);
        now = 1_000_000;
    });

    it('is picked up without a restart, after the check interval', async () => {
        const handle = new MirrorHandle(livePath, { checkEveryMs: 5000, now: () => now });
        const c = createMirrorIgdbClient({ path: livePath, handle });
        expect((await c.fetchGame(4))?.name).toBe('Tunic');
        expect(await c.fetchGame(50)).toBeNull();

        // The next dump renames a new file into place; Tunic is renamed and a game is added
        const games = GAMES.replace('4,Tunic,tunic', '4,Tunic Reloaded,tunic').concat(
            '\n50,Brand New,brand-new,,,0,,,,,,,,,,'
        );
        await runMirror({
            source: fakeSource({ games }, '1700086400_games.csv'),
            path: livePath,
            minGames: 1
        });

        // Within the interval the old file is still in use
        now += 1000;
        expect((await c.fetchGame(4))?.name).toBe('Tunic');
        now += 5000;
        expect((await c.fetchGame(4))?.name).toBe('Tunic Reloaded');
        expect((await c.fetchGame(50))?.name).toBe('Brand New');
        handle.close();
    });

    it('starts using a mirror that is built after the server started', async () => {
        const later = join(dir, 'later.db');
        const handle = new MirrorHandle(later, { checkEveryMs: 5000, now: () => now });
        const fetchGame = vi.fn().mockResolvedValue(null);
        const c = createMirrorIgdbClient({
            path: later,
            handle,
            fallback: liveClient({ fetchGame })
        });
        await c.fetchGame(1);
        expect(fetchGame).toHaveBeenCalledTimes(1);

        copyFileSync(path, later);
        now += 5000;
        expect((await c.fetchGame(1))?.name).toBe('Hades');
        expect(fetchGame).toHaveBeenCalledTimes(1);
        handle.close();
    });
});

describe('lookup counters', () => {
    const live = () =>
        liveClient({
            search: vi.fn().mockResolvedValue([]),
            fetchGame: vi.fn().mockResolvedValue(null),
            fetchReleaseDates: vi.fn().mockResolvedValue([]),
            fetchScreenshots: vi.fn().mockResolvedValue(null),
            fetchSeries: vi.fn().mockResolvedValue(null),
            fetchSimilarGames: vi.fn().mockResolvedValue([]),
            fetchPlatforms: vi.fn().mockResolvedValue([])
        });

    it('counts lookups the mirror answered and those sent on to live IGDB, per kind', async () => {
        const c = createMirrorIgdbClient({ path, fallback: live(), now: () => 1234 });
        await c.search('hades'); // mirror
        await c.search('witcer'); // no local hit: live
        await c.fetchGame(1); // mirror
        await c.fetchGame(5000); // not in the mirror: live
        await c.fetchReleaseDates([1, 4]); // all known: mirror
        await c.fetchReleaseDates([1, 5000]); // one unknown: live for that one
        await c.fetchSimilarGames(1); // mirror
        await c.fetchSeries(100); // mirror
        await c.fetchSeries(999); // unknown series: live
        await c.fetchScreenshots(4); // mirror

        const { since, counts } = c.lookups!();
        expect(since).toBe(1234);
        expect(counts.search).toEqual({ local: 1, live: 1 });
        expect(counts.fetchGame).toEqual({ local: 1, live: 1 });
        expect(counts.fetchReleaseDates).toEqual({ local: 1, live: 1 });
        expect(counts.fetchSimilarGames).toEqual({ local: 1, live: 0 });
        expect(counts.fetchSeries).toEqual({ local: 1, live: 1 });
        expect(counts.fetchScreenshots).toEqual({ local: 1, live: 0 });
        expect(counts.fetchPlatforms).toEqual({ local: 0, live: 0 });
    });

    it('counts a miss as answered by the mirror when there is no live client to ask', async () => {
        const c = createMirrorIgdbClient({ path });
        await c.fetchGame(5000);
        await c.search('zzzz');
        expect(c.lookups!().counts.fetchGame).toEqual({ local: 1, live: 0 });
        expect(c.lookups!().counts.search).toEqual({ local: 1, live: 0 });
    });

    it('sends everything to live IGDB when there is no mirror file', async () => {
        const c = createMirrorIgdbClient({ path: join(dir, 'absent.db'), fallback: live() });
        await c.search('hades');
        await c.fetchGame(1);
        await c.fetchPlatforms();
        const { counts } = c.lookups!();
        expect(counts.search).toEqual({ local: 0, live: 1 });
        expect(counts.fetchGame).toEqual({ local: 0, live: 1 });
        expect(counts.fetchPlatforms).toEqual({ local: 0, live: 1 });
    });

    it('hands out a snapshot, and does not count the connection checks', async () => {
        const ping = vi.fn().mockResolvedValue({ ok: true, ms: 1, error: null });
        const c = createMirrorIgdbClient({ path, fallback: liveClient({ ping }) });
        await c.ping!();
        const first = c.lookups!();
        first.counts.search.local = 99;
        expect(c.lookups!().counts.search.local).toBe(0);
        expect(Object.values(c.lookups!().counts).every((n) => n.local + n.live === 0)).toBe(true);
    });
});
