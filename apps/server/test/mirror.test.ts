import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { releaseFromFormats } from '../src/igdb/mappers.js';
import { buildMirror } from '../src/mirror/build.js';
import { parseIds } from '../src/mirror/csv.js';
import type { DumpSource } from '../src/mirror/dumps.js';
import { readMirrorInfo, runMirror } from '../src/mirror/run.js';
import { MIRROR_SCHEMA_VERSION } from '../src/mirror/schema.js';
import { FIXTURES, GAME_HEADER, fakeSource } from './mirror-fixtures.js';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mirror-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function built(overrides: Partial<Record<string, string>> = {}) {
    const outPath = join(dir, 'igdb.db');
    await buildMirror({ source: fakeSource(overrides), outPath });
    return new Database(outPath, { readonly: true });
}

describe('parseIds', () => {
    it('reads Postgres-style arrays', () => {
        expect(parseIds('{1,2, 3}')).toEqual([1, 2, 3]);
        expect(parseIds('{}')).toEqual([]);
        expect(parseIds('')).toEqual([]);
        expect(parseIds(undefined)).toEqual([]);
    });
});

describe('releaseFromFormats', () => {
    it('picks the most exact format and treats TBD as unknown', () => {
        expect(releaseFromFormats('2020-01-01', [3, 0])).toEqual({
            releaseDate: '2020-01-01',
            releasePrecision: 'day'
        });
        expect(releaseFromFormats('2020-01-01', [7])).toEqual({
            releaseDate: null,
            releasePrecision: null
        });
        expect(releaseFromFormats('2020-01-01', [])).toEqual({
            releaseDate: '2020-01-01',
            releasePrecision: null
        });
    });
});

describe('buildMirror', () => {
    it('maps game columns, including quoted text', async () => {
        const db = await built();
        const hades = db.prepare('SELECT * FROM games WHERE id = 1').get() as Record<
            string,
            unknown
        >;
        expect(hades).toMatchObject({
            name: 'Hades',
            slug: 'hades',
            summary: 'Fight, "out"\nof hell',
            release_date: '2020-09-17',
            release_precision: 'day',
            cover_image_id: 'co_hades',
            igdb_rating: 91,
            igdb_rating_count: 500,
            game_type_id: 0,
            game_type: 'Main Game',
            is_edition: 0,
            searchable: 1,
            ttb_hastily_s: 3600,
            ttb_normally_s: 7200,
            ttb_completely_s: 10800,
            ttb_count: 12,
            similar_games: '[2,3,7,9,999,4]'
        });
        const bare = db.prepare('SELECT * FROM games WHERE id = 6').get() as Record<
            string,
            unknown
        >;
        expect(bare).toMatchObject({
            summary: null,
            release_date: null,
            cover_image_id: null,
            ttb_normally_s: null,
            similar_games: null
        });
    });

    it('keeps the first six screenshots in IGDB order', async () => {
        const db = await built();
        const row = db.prepare('SELECT screenshots FROM games WHERE id = 1').get() as {
            screenshots: string;
        };
        expect(JSON.parse(row.screenshots)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
        const tunic = db.prepare('SELECT screenshots FROM games WHERE id = 4').get() as {
            screenshots: string;
        };
        expect(JSON.parse(tunic.screenshots)).toEqual(['s9']);
    });

    it('derives release precision from the dates that carry the first date', async () => {
        const db = await built();
        const get = (id: number) =>
            db
                .prepare('SELECT release_date d, release_precision p FROM games WHERE id = ?')
                .get(id);
        expect(get(1)).toEqual({ d: '2020-09-17', p: 'day' });
        expect(get(4)).toEqual({ d: '2022-03-16', p: 'month' });
        expect(get(5)).toEqual({ d: null, p: null }); // TBD
    });

    it('treats a time to beat with no values as unknown', async () => {
        const db = await built();
        expect(db.prepare('SELECT ttb_count c FROM games WHERE id = 4').get()).toEqual({ c: null });
    });

    it('keeps every game but marks which ones search may show', async () => {
        const db = await built();
        const rows = db
            .prepare('SELECT id, searchable s, is_edition e FROM games ORDER BY id')
            .all();
        expect(rows).toEqual([
            { id: 1, s: 1, e: 0 },
            { id: 2, s: 0, e: 0 }, // DLC
            { id: 3, s: 0, e: 1 }, // edition
            { id: 4, s: 1, e: 0 },
            { id: 5, s: 1, e: 0 }, // unknown type is kept
            { id: 6, s: 0, e: 0 }, // Pack / Addon
            { id: 7, s: 1, e: 0 },
            { id: 8, s: 1, e: 0 },
            { id: 9, s: 1, e: 0 },
            { id: 10, s: 1, e: 0 },
            { id: 11, s: 1, e: 0 },
            { id: 12, s: 1, e: 0 },
            { id: 13, s: 1, e: 0 },
            { id: 14, s: 1, e: 0 },
            { id: 15, s: 1, e: 0 }
        ]);
    });

    it('only puts searchable games in the full-text index', async () => {
        const db = await built();
        const find = (q: string) =>
            db
                .prepare(
                    'SELECT g.id FROM games_fts f JOIN games g ON g.id = f.rowid WHERE games_fts MATCH ? ORDER BY g.id'
                )
                .all(q)
                .map((r) => (r as { id: number }).id);
        expect(find('hades')).toEqual([1, 9]); // not the DLC or the edition
        expect(find('tun*')).toEqual([4]);
        expect(find('cafe')).toEqual([]); // add-on type
    });

    it('stores platforms, genres, themes and series with their joins', async () => {
        const db = await built();
        expect(
            db
                .prepare(
                    'SELECT p.name, p.abbreviation FROM game_platforms j JOIN platforms p ON p.id = j.platform_id WHERE j.game_id = 1 ORDER BY p.id'
                )
                .all()
        ).toEqual([
            { name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
            { name: 'Nintendo Switch', abbreviation: null }
        ]);
        expect(db.prepare('SELECT genre_id g FROM game_genres WHERE game_id = 1').all()).toEqual([
            { g: 12 }
        ]);
        expect(db.prepare('SELECT theme_id t FROM game_themes WHERE game_id = 1').all()).toEqual([
            { t: 31 }
        ]);
        expect(
            db
                .prepare(
                    'SELECT s.name FROM game_series j JOIN series s ON s.id = j.series_id WHERE j.game_id = 1'
                )
                .all()
        ).toEqual([{ name: 'Hades Series' }]);
    });

    it('leaves no staging file behind', async () => {
        await built();
        expect(readdirSync(dir)).toEqual(['igdb.db']);
    });

    it('removes everything when a dump fails', async () => {
        const source = fakeSource();
        const open = source.open.bind(source);
        source.open = async (endpoint) => {
            if (endpoint === 'games') throw new Error('download failed');
            return open(endpoint);
        };
        await expect(buildMirror({ source, outPath: join(dir, 'igdb.db') })).rejects.toThrow(
            'download failed'
        );
        expect(readdirSync(dir)).toEqual([]);
    });
});

describe('runMirror', () => {
    const path = () => join(dir, 'data', 'igdb.db');
    const run = (source: DumpSource, extra: { force?: boolean; minGames?: number } = {}) =>
        runMirror({ source, path: path(), minGames: 1, ...extra });

    it('builds, records the dump it came from, and skips when nothing changed', async () => {
        const first = await run(fakeSource());
        expect(first.status).toBe('built');
        expect(readMirrorInfo(path())).toMatchObject({
            schemaVersion: MIRROR_SCHEMA_VERSION,
            dump: '1700000000_games.csv',
            games: 15
        });

        const again = fakeSource();
        expect((await run(again)).status).toBe('current');
        expect(again.opened).toEqual([]); // nothing downloaded

        expect((await run(again, { force: true })).status).toBe('built');
    });

    it('rebuilds when a newer dump is published', async () => {
        await run(fakeSource());
        const result = await run(fakeSource({}, '1700086400_games.csv'));
        expect(result.status).toBe('built');
        expect(readMirrorInfo(path())?.dump).toBe('1700086400_games.csv');
    });

    it('keeps the old mirror when the new build fails', async () => {
        await run(fakeSource());
        const broken = fakeSource({}, '1700086400_games.csv');
        broken.open = async (endpoint) => {
            if (endpoint === 'games') throw new Error('download failed');
            return Readable.from([FIXTURES[endpoint]!]);
        };
        await expect(run(broken)).rejects.toThrow('download failed');
        expect(readMirrorInfo(path())?.dump).toBe('1700000000_games.csv');
        expect(existsSync(`${path()}.new`)).toBe(false);
    });

    it('rejects a mirror that is too small or lost too many games', async () => {
        await expect(
            runMirror({ source: fakeSource(), path: path(), minGames: 100 })
        ).rejects.toThrow('only 15 games');
        expect(existsSync(path())).toBe(false);

        await run(fakeSource());
        const shrunk = [GAME_HEADER, '4,Tunic,tunic,,,0,,,,,,,,,,'].join('\n');
        await expect(run(fakeSource({ games: shrunk }, '1700086400_games.csv'))).rejects.toThrow(
            'shrank'
        );
        expect(readMirrorInfo(path())?.games).toBe(15);
    });

    it('fails clearly when IGDB does not list a needed dump', async () => {
        const source = fakeSource();
        source.list = async () => [{ endpoint: 'games', fileName: 'x_games.csv', updatedAt: 1 }];
        await expect(run(source)).rejects.toThrow('does not list a dump for "covers"');
    });
});
