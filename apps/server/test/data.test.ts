import { describe, expect, it } from 'vitest';
import {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    MAX_IMPORT_GAMES,
    exportFileSchema,
    type ExportFile
} from '@gamequeue/shared';
import { games, platforms } from '../src/db/schema.js';
import { PC, PS5, SWITCH, setupApi } from './api.js';
import { cookieFrom, makeApp, register } from './helpers.js';
import { IMPORTS_PER_DAY } from '../src/routes/data.js';
import { importData, resolveImportCatalog } from '../src/services/import.js';

type Api = Awaited<ReturnType<typeof setupApi>>;

/** A collection that exercises every part of the export format. */
async function richCollection(s: Api) {
    const { call, add } = s;
    const hades = await add(1, [PC.id, PS5.id], ['roguelike', 'fast']);
    const celeste = await add(2, [SWITCH.id]);
    const knight = await add(3);
    const wilds = await add(4);

    // Hades: finished once, now being replayed on PS5
    await call(`/entries/${hades.id}/start`, 'POST', { platformId: PC.id, date: '2025-01-01' });
    await call(`/entries/${hades.id}/finish`, 'POST', { date: '2025-02-01', rating: 4 });
    await call(`/entries/${hades.id}/start`, 'POST', { platformId: PS5.id, date: '2025-06-01' });

    // Celeste: an old playthrough with unknown dates
    await call(`/entries/${celeste.id}/playthroughs`, 'POST', { outcome: 'abandoned' });

    // Hollow Knight: paused
    await call(`/entries/${knight.id}/start`, 'POST', { platformId: PC.id, date: '2025-03-01' });
    await call(`/entries/${knight.id}/pause`, 'POST');

    // Outer Wilds: unplayed but personalised
    await call(`/entries/${wilds.id}`, 'PATCH', { rating: 4 });
    await call(`/entries/${wilds.id}/notes`, 'POST', { body: 'Spoiler-free please' });
    await call(`/entries/${wilds.id}/notes`, 'POST', { body: 'Great opener', public: true });

    const queue = (await call('/lists', 'POST', { name: 'Up next' })).list.id;
    const cozy = (await call('/lists', 'POST', { name: 'Cozy' })).list.id;
    for (const e of [knight, hades, wilds])
        await call(`/lists/${queue}/items`, 'POST', { igdbId: e.game.id });
    await call(`/lists/${cozy}/items`, 'POST', { igdbId: celeste.game.id });
    return { hades, celeste, knight, wilds, queue, cozy };
}

const exportOf = async (s: Api) =>
    (await s.call('/data/export')) as unknown as ExportFile & { status: number };
const stable = (f: ExportFile): Omit<ExportFile, 'exportedAt'> => {
    const { exportedAt: _ignored, ...rest } = f;
    return JSON.parse(JSON.stringify(rest));
};
const importFile = (s: Api, file: unknown, commit: boolean) =>
    s.call(`/data/import${commit ? '?commit=true' : ''}`, 'POST', file);

describe('export', () => {
    it('produces a versioned, self-contained document of your data', async () => {
        const s = await setupApi();
        await richCollection(s);
        const file = await exportOf(s);
        expect(file).toMatchObject({ format: EXPORT_FORMAT, version: EXPORT_VERSION });
        expect(file.games).toHaveLength(4);
        const hades = file.games.find((g) => g.igdbId === 1)!;
        expect(hades).toMatchObject({
            status: 'playing',
            tags: ['fast', 'roguelike'],
            game: { name: 'Hades', releaseDate: '2020-05-01' },
            platforms: [{ id: PC.id }, { id: PS5.id }]
        });
        expect(hades.game.genres.length).toBeGreaterThan(0);
        expect(hades.game.ttb).toMatchObject({ normallySeconds: 72000 });
        expect(hades.playthroughs).toMatchObject([
            {
                outcome: 'finished',
                startedOn: '2025-01-01',
                endedOn: '2025-02-01',
                rating: 4,
                platform: { id: PC.id }
            },
            { outcome: null, startedOn: '2025-06-01', endedOn: null, platform: { id: PS5.id } }
        ]);
        expect(file).not.toHaveProperty('slots');
        expect(file.lists).toEqual([
            { name: 'Up next', description: '', games: [3, 1, 4] },
            { name: 'Cozy', description: '', games: [2] }
        ]);
    });

    it('downloads as a JSON attachment', async () => {
        const s = await setupApi();
        const res = await s.app.request('/api/data/export', { headers: { cookie: s.cookie } });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toMatch(
            /^attachment; filename="gamequeue-export-\d{4}-\d{2}-\d{2}\.json"$/
        );
        expect(res.headers.get('content-type')).toMatch(/application\/json/);
        expect(JSON.parse(await res.text()).format).toBe(EXPORT_FORMAT);
    });

    it("only contains the signed-in user's data", async () => {
        const s = await setupApi();
        await richCollection(s);
        const other = await s.secondUser();
        const theirs = (await s.call(
            '/data/export',
            'GET',
            undefined,
            other
        )) as unknown as ExportFile;
        expect(theirs.games).toEqual([]);
        expect(theirs.lists).toEqual([]);
    });

    it('requires authentication', async () => {
        const { app } = await setupApi();
        expect((await app.request('/api/data/export')).status).toBe(401);
        expect(
            (
                await app.request('/api/data/import', {
                    method: 'POST',
                    headers: { origin: 'http://localhost' }
                })
            ).status
        ).toBe(401);
    });
});

describe('import into an empty account (a restore)', () => {
    it('round-trips everything exactly', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);

        const b = await setupApi(); // a fresh install: nothing cached, games come from IGDB
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).toMatchObject({
            dryRun: false,
            games: { added: 4, updated: 0, unchanged: 0 },
            playthroughs: { added: 4, duplicates: 0, skipped: 0 },
            lists: { created: 2, itemsAdded: 4 },
            notes: []
        });
        expect(stable(await exportOf(b))).toEqual(stable(file));

        // and the restored data behaves like the original
        const entries = (await b.call('/entries?sort=title')).entries as {
            game: { name: string };
            status: string;
        }[];
        expect(entries.map((e) => [e.game.name, e.status])).toEqual([
            ['Celeste', 'abandoned'],
            ['Hades', 'playing'],
            ['Hollow Knight', 'paused'],
            ['Outer Wilds', 'unplayed']
        ]);
        expect((await b.call('/entries?view=backlog')).entries).toHaveLength(1);
    });

    it("takes every game's metadata from IGDB, never from the file", async () => {
        const a = await setupApi();
        await richCollection(a);
        const file: ExportFile = JSON.parse(JSON.stringify(await exportOf(a)));
        const hadesSnapshot = file.games.find((g) => g.igdbId === 1)!.game;
        hadesSnapshot.name = 'Renamed By File';
        hadesSnapshot.coverImageId = 'cofile';
        hadesSnapshot.summary = 'Written by the file';
        const b = await setupApi();
        await importFile(b, file, true);
        const hades = (await b.call('/entries?q=hades')).entries[0];
        expect(hades.game).toMatchObject({ name: 'Hades', coverImageId: 'co1', igdbRating: 80 });
        expect(hades.game.summary).not.toBe('Written by the file');
        expect(hades.game.genres.length).toBeGreaterThan(0);
        expect(hades.game.ttb.normally).toBe(1200);
    });

    it("refuses, importing nothing, when games aren't cached and IGDB isn't configured", async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);
        const { app, db } = makeApp();
        const cookie = cookieFrom(await register(app));
        const res = await app.request('/api/data/import?commit=true', {
            method: 'POST',
            body: JSON.stringify(file),
            headers: { origin: 'http://localhost', cookie, 'content-type': 'application/json' }
        });
        expect(res.status).toBe(503);
        expect(db.select().from(games).all()).toHaveLength(0);
    });

    it('is idempotent: importing the same file again changes nothing', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);
        const b = await setupApi();
        await importFile(b, file, true);
        const before = stable(await exportOf(b));

        const again = await importFile(b, file, true);
        expect(again.report).toMatchObject({
            games: { added: 0, updated: 0, unchanged: 4 },
            playthroughs: { added: 0, duplicates: 4, skipped: 0 },
            lists: { created: 0, itemsAdded: 0 }
        });
        expect(stable(await exportOf(b))).toEqual(before);
    });

    it('a dry run reports what would happen and writes nothing', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);
        const b = await setupApi();

        const preview = await importFile(b, file, false);
        expect(preview.report.dryRun).toBe(true);
        expect(preview.report.games.added).toBe(4);
        expect((await exportOf(b)).games).toEqual([]);
        expect((await exportOf(b)).lists).toEqual([]);
        // Nothing of the user's; the games it looked up on IGDB stay cached, as browsing would leave them
        expect(b.db.select({ name: games.name }).from(games).all()).toHaveLength(4);

        const real = await importFile(b, file, true);
        expect({ ...real.report, dryRun: true }).toEqual(preview.report);
        expect((await exportOf(b)).games).toHaveLength(4);
    });
});

describe('merging into existing data', () => {
    async function scenario() {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);

        // The importing account already has some of the same games, with its own opinions
        const b = await setupApi();
        const hades = await b.add(1, [PC.id], ['mine']);
        await b.call(`/entries/${hades.id}`, 'PATCH', { rating: 5 });
        await b.call(`/entries/${hades.id}/notes`, 'POST', { body: 'My own notes' });
        await b.call(`/entries/${hades.id}/start`, 'POST', { date: '2025-07-01' }); // open playthrough
        const celeste = await b.add(2, [SWITCH.id]);
        const extra = await b.add(4);
        const list = (await b.call('/lists', 'POST', { name: 'UP NEXT' })).list.id;
        await b.call(`/lists/${list}/items`, 'POST', { igdbId: extra.game.id });
        return { file, b, hades, celeste, extra, list };
    }

    it('keeps your values, fills gaps, and unions platforms and tags', async () => {
        const { file, b, hades, celeste } = await scenario();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);

        const merged = (await b.call(`/entries/${hades.id}`)).entry;
        expect(merged).toMatchObject({ rating: 5 });
        expect(merged.notes.map((n: { body: string }) => n.body)).toEqual(['My own notes']);
        expect(merged.tags).toEqual(['fast', 'mine', 'roguelike']);
        expect(merged.platforms.map((p: { id: number }) => p.id).sort()).toEqual(
            [PC.id, PS5.id].sort()
        );

        // Celeste had nothing of its own to protect, so it just gains the old playthrough
        const c = (await b.call(`/entries/${celeste.id}`)).entry;
        expect(c.status).toBe('abandoned');
        expect(c.playthroughCount).toBe(1);
    });

    it('adds missing playthroughs but never a second in-progress one', async () => {
        const { file, b, hades } = await scenario();
        const res = await importFile(b, file, true);
        const history = (await b.call(`/entries/${hades.id}/playthroughs`)).playthroughs as {
            outcome: string | null;
            startedOn: string;
        }[];
        // the file's finished run is added; its in-progress run is skipped (you already have one)
        expect(history.map((p) => [p.outcome, p.startedOn])).toEqual([
            [null, '2025-07-01'],
            ['finished', '2025-01-01']
        ]);
        expect(res.report.playthroughs.skipped).toBe(1);
        expect(
            res.report.notes.some((n: string) => n.includes('Hades') && n.includes('in-progress'))
        ).toBe(true);
        // still playing the run you had
        expect((await b.call(`/entries/${hades.id}`)).entry).toMatchObject({ status: 'playing' });
    });

    it('reports your kept values in the notes', async () => {
        const { file, b } = await scenario();
        const { report } = await importFile(b, file, false);
        expect(report.notes).toContain('Hades: kept your rating of 5 (the file has 4)');
    });

    it('merges lists by name (case-insensitive) and appends to the end', async () => {
        const { file, b, list } = await scenario();
        await importFile(b, file, true);
        const lists = (await b.call('/lists')).lists as {
            id: number;
            name: string;
            count: number;
        }[];
        expect(lists.map((l) => [l.name, l.count]).sort()).toEqual([
            ['Cozy', 1],
            ['UP NEXT', 3]
        ]);
        const merged = (await b.call(`/lists/${list}`)).list.items as {
            game: { name: string };
        }[];
        // your Outer Wilds stays first; Hollow Knight and Hades follow in the file's order
        expect(merged.map((e) => e.game.name)).toEqual(['Outer Wilds', 'Hollow Knight', 'Hades']);
    });

    it('does not overwrite cached game or platform data', async () => {
        const { file, b } = await scenario();
        const tampered: ExportFile = JSON.parse(JSON.stringify(file));
        tampered.games.find((g) => g.igdbId === 1)!.game.name = 'Renamed By File';
        tampered.games[0]!.platforms[0] = {
            ...tampered.games[0]!.platforms[0]!,
            name: 'Hacked platform name'
        };
        await importFile(b, tampered, true);
        expect((await b.call('/entries?q=hades')).entries[0].game.name).toBe('Hades');
        expect(
            b.db
                .select()
                .from(platforms)
                .all()
                .some((p) => p.name === 'Hacked platform name')
        ).toBe(false);
    });

    it("skips a game IGDB doesn't know, with everything of it, and keeps the rest", async () => {
        const { file, b } = await scenario();
        const withFake: ExportFile = JSON.parse(JSON.stringify(file));
        const clone = JSON.parse(JSON.stringify(withFake.games[0]!));
        clone.igdbId = 999;
        clone.game.name = 'Made Up Game';
        clone.status = 'unplayed';
        clone.playthroughs = [];
        clone.tags = [];
        withFake.games.push(clone);
        withFake.queue.push(999);
        withFake.lists[0]!.games.push(999);
        withFake.wishlist.push({
            igdbId: 998,
            game: { ...clone.game, name: 'Made Up Wish' },
            platform: null,
            note: '',
            addedAt: 1
        });
        const res = await importFile(b, withFake, true);
        expect(res.status).toBe(200);
        expect(res.report.games.skipped).toBe(1);
        expect(res.report.notes).toEqual(
            expect.arrayContaining([
                "Made Up Game (IGDB id 999) isn't on IGDB, so it was skipped",
                "Made Up Wish (IGDB id 998) isn't on IGDB, so it was skipped in the wishlist"
            ])
        );
        expect((await b.call('/entries?q=made')).entries).toEqual([]);
        expect(
            b.db
                .select()
                .from(games)
                .all()
                .map((g) => g.id)
        ).not.toContain(999);
    });

    it("drops platforms IGDB doesn't list, and skips a game left with none", async () => {
        const { file, b } = await scenario();
        const odd: ExportFile = JSON.parse(JSON.stringify(file));
        const fake = { id: 99999, name: 'Made Up Console', abbreviation: null };
        const celeste = odd.games.find((g) => g.igdbId === 2)!;
        celeste.platforms = [fake];
        const res = await importFile(b, odd, true);
        expect(res.report.notes).toContain(
            'Celeste was skipped: none of its platforms are on IGDB'
        );
        expect(
            b.db
                .select()
                .from(platforms)
                .all()
                .map((p) => p.id)
        ).not.toContain(99999);
    });
});

describe('validation', () => {
    async function validFile() {
        const a = await setupApi();
        await richCollection(a);
        return JSON.parse(JSON.stringify(await exportOf(a))) as ExportFile;
    }
    const paths = (res: Record<string, any>) =>
        (res.details as { path: string; message: string }[]).map((d) => d.path);

    it('rejects things that are not exports, with clear messages', async () => {
        const s = await setupApi();
        const notJson = await s.app.request('/api/data/import', {
            method: 'POST',
            headers: {
                cookie: s.cookie,
                origin: 'http://localhost',
                'content-type': 'application/json'
            },
            body: '{nope'
        });
        expect(notJson.status).toBe(400);
        expect((await notJson.json()).error).toMatch(/valid JSON/);

        for (const body of [[], { hello: 1 }, { format: 'something-else', version: 1 }, null]) {
            const res = await importFile(s, body, false);
            expect(res.status, JSON.stringify(body)).toBe(400);
            expect(res.error).toMatch(/GameQueue export/);
        }
        const newer = await importFile(s, { format: EXPORT_FORMAT, version: 2 }, false);
        expect(newer.status).toBe(400);
        expect(newer.error).toMatch(/newer version/);
        expect((await importFile(s, { format: EXPORT_FORMAT, version: 0 }, false)).error).toMatch(
            /Unsupported/
        );
    });

    it('points at the exact place of each problem and imports nothing', async () => {
        const s = await setupApi();
        const file = await validFile();
        file.games[1]!.status = 'dreaming' as never;
        file.games[0]!.playthroughs[0]!.rating = 6;
        file.games[2]!.playthroughs = [
            {
                platform: null,
                startedOn: '2025-05-02',
                endedOn: '2025-05-01',
                outcome: 'finished',
                rating: null
            }
        ];
        file.games[3]!.platforms = [];
        file.games[2]!.game.releaseDate = '2020-02-31';
        const res = await importFile(s, file, true);
        expect(res.status).toBe(400);
        expect(res.error).toMatch(/nothing was imported/);
        expect(paths(res)).toEqual(
            expect.arrayContaining([
                'games.1.status',
                'games.0.playthroughs.0.rating',
                'games.2.playthroughs.0.endedOn',
                'games.3.platforms',
                'games.2.game.releaseDate'
            ])
        );
        expect((await exportOf(s)).games).toEqual([]);
    });

    it('refuses a cover id that is not an IGDB image id, so it can never add an image URL', async () => {
        const s = await setupApi();
        const file = await validFile();
        // In a srcset this would add an attacker's image as the 2x candidate
        file.games[0]!.game.coverImageId = 'x 1x, https://attacker.example/i.png?';
        file.games[1]!.game.coverImageId = 'CO1';
        const res = await importFile(s, file, true);
        expect(res.status).toBe(400);
        expect(paths(res)).toEqual(
            expect.arrayContaining(['games.0.game.coverImageId', 'games.1.game.coverImageId'])
        );
        expect((await exportOf(s)).games).toEqual([]);
    });

    it('catches cross-references and duplicates in the file', async () => {
        const s = await setupApi();
        const file = await validFile();
        file.games.push(JSON.parse(JSON.stringify(file.games[0]!)));
        file.lists[0]!.games.push(777);
        file.games[0]!.playthroughs.push({
            platform: null,
            startedOn: '2025-08-01',
            endedOn: null,
            outcome: null,
            rating: null
        });
        const res = await importFile(s, file, false);
        expect(res.status).toBe(400);
        expect(paths(res)).toEqual(
            expect.arrayContaining(['games.4.igdbId', 'games.0.playthroughs'])
        );
    });

    it('caps the number of problems it reports but says how many there were', async () => {
        const s = await setupApi();
        const file = await validFile();
        file.games = Array.from({ length: 80 }, (_, i) => ({
            ...file.games[0]!,
            igdbId: i + 1,
            rating: 99
        }));
        file.lists = [];
        const res = await importFile(s, file, false);
        expect(res.status).toBe(400);
        expect(res.details).toHaveLength(50);
        expect(res.totalIssues).toBeGreaterThanOrEqual(80);
    });
});

describe('grids, tier lists and slots (removed features) in an old export', () => {
    const game = {
        name: 'Hades',
        slug: 'hades',
        summary: null,
        releaseDate: null,
        coverImageId: null,
        platforms: [],
        genres: [],
        themes: [],
        ttbMinutes: null,
        igdbRating: null
    };
    const legacy = {
        slots: [
            { name: 'Main', position: 0, igdbId: 1 },
            { name: 'Secondary', position: 1, igdbId: null }
        ],
        grids: [
            {
                title: 'Best of',
                description: '',
                cols: 3,
                rows: 2,
                cells: [{ position: 0, label: 'A', game: { igdbId: 2, game } }]
            }
        ],
        tierLists: [
            {
                title: 'Ranked',
                description: '',
                tiers: [{ name: 'S', color: 'red', games: [{ igdbId: 3, game }] }],
                unranked: []
            }
        ]
    };

    it('accepts a file that still has them, ignores them, and exports none', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = { ...(await exportOf(a)), ...legacy };
        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).not.toHaveProperty('slots');
        expect(res.report).not.toHaveProperty('grids');
        expect(res.report).not.toHaveProperty('tierLists');
        const out = (await exportOf(b)) as Record<string, unknown>;
        expect(out).not.toHaveProperty('slots');
        expect(out).not.toHaveProperty('grids');
        expect(out).not.toHaveProperty('tierLists');
        expect(stable(await exportOf(b))).toEqual(stable(await exportOf(a)));
    });
});

describe('removed endpoints', () => {
    it('are gone: grids, tier lists, prices and their share cards', async () => {
        const s = await setupApi();
        for (const path of [
            '/grids',
            '/tier-lists',
            '/igdb/games/1/prices',
            '/profiles/user_me/grids/1',
            '/profiles/user_me/tier-lists/1',
            '/og/grid/user_me/1.png',
            '/og/tiers/user_me/1.png'
        ])
            expect(
                (await s.app.request(`/api${path}`, { headers: { cookie: s.cookie } })).status,
                path
            ).toBe(404);
    });
});

describe('import limits', () => {
    it('looks up at most so many new games per run; running the file again adds the rest', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = exportFileSchema.parse(await exportOf(a));
        const b = await setupApi();
        const first = await resolveImportCatalog(b.db, b.igdb, file, 2);
        expect(first.games.size).toBe(2);
        expect(first.deferred.size).toBe(2);
        const report = importData(b.db, b.userId, file, first, { dryRun: false });
        expect(report.games).toMatchObject({ added: 2, skipped: 2 });
        // One note for all of them, not one per game
        expect(report.notes.filter((n) => n.includes('import the same file again'))).toHaveLength(
            1
        );

        const second = await resolveImportCatalog(b.db, b.igdb, file, 2);
        expect(second.deferred.size).toBe(0);
        const again = importData(b.db, b.userId, file, second, { dryRun: false });
        expect(again.games).toMatchObject({ added: 2, unchanged: 2, skipped: 0 });
    });

    it(`allows ${IMPORTS_PER_DAY} committed imports a day per user; dry runs are free`, async () => {
        const s = await setupApi();
        await richCollection(s);
        const file = await exportOf(s);
        for (let i = 0; i < IMPORTS_PER_DAY + 2; i++)
            expect((await importFile(s, file, false)).status).toBe(200);
        for (let i = 0; i < IMPORTS_PER_DAY; i++)
            expect((await importFile(s, file, true)).status).toBe(200);
        const over = await importFile(s, file, true);
        expect(over.status).toBe(429);
        expect(over.error).toMatch(/a day/);
    });

    it('refuses a file with more games than the limit', async () => {
        const s = await setupApi();
        const res = await importFile(
            s,
            {
                format: EXPORT_FORMAT,
                version: EXPORT_VERSION,
                exportedAt: '2026-01-01',
                games: [],
                lists: [],
                queue: Array.from({ length: MAX_IMPORT_GAMES + 1 }, (_, i) => i + 1)
            },
            false
        );
        expect(res.status).toBe(400);
        expect(res.details.map((d: { path: string }) => d.path)).toContain('queue');
    });
});

describe('lists with games you do not own', () => {
    it('round-trips through export and import with their order, and the queue stays owned-only', async () => {
        const a = await setupApi();
        const hades = await a.add(1);
        const list = (await a.call('/lists', 'POST', { name: 'Mixed' })).list.id;
        for (const igdbId of [3, hades.game.id, 2])
            await a.call(`/lists/${list}/items`, 'POST', { igdbId });
        await a.call('/queue/items', 'POST', { igdbId: hades.game.id });
        const file = await exportOf(a);
        expect(file.games.map((g) => g.igdbId)).toEqual([1]);
        expect(file.lists).toEqual([{ name: 'Mixed', description: '', games: [3, 1, 2] }]);
        expect(file.queue).toEqual([1]);

        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).toMatchObject({
            lists: { created: 1, itemsAdded: 3 },
            queue: { added: 1 },
            notes: []
        });
        const imported = (await b.call('/lists')).lists[0].id;
        const items = (await b.call(`/lists/${imported}`)).list.items as any[];
        expect(items.map((i) => [i.game.name, i.entry?.status ?? null])).toEqual([
            ['Hollow Knight', null],
            ['Hades', 'unplayed'],
            ['Celeste', null]
        ]);
        expect(stable(await exportOf(b))).toEqual(stable(file));
    });

    it('skips list games IGDB does not know, with a note', async () => {
        const a = await setupApi();
        await a.call('/lists', 'POST', { name: 'L' });
        const file = JSON.parse(JSON.stringify(await exportOf(a)));
        file.lists[0].games = [3, 777777];
        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.report.lists.itemsAdded).toBe(1);
        expect(res.report.notes.join('\n')).toMatch(/777777.*isn't on IGDB.*the list L/);
    });
});
