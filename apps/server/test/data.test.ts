import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from '@gamequeue/shared';
import { games, platforms } from '../src/db/schema.js';
import { PC, PS5, SWITCH, setupApi } from './api.js';

type Api = Awaited<ReturnType<typeof setupApi>>;

/** A collection that exercises every part of the export format. */
async function richCollection(s: Api) {
    const { call, add } = s;
    const hades = await add(1, [PC.id, PS5.id], ['roguelike', 'fast']);
    const celeste = await add(2, [SWITCH.id]);
    const knight = await add(3);
    const wilds = await add(4);

    // Hades: finished once, now being replayed on PS5 and sitting in Main
    await call(`/entries/${hades.id}/start`, 'POST', { platformId: PC.id, date: '2025-01-01' });
    await call(`/entries/${hades.id}/finish`, 'POST', { date: '2025-02-01', rating: 4 });
    await call(`/entries/${hades.id}/start`, 'POST', { platformId: PS5.id, date: '2025-06-01' });
    const slotList = (await call('/slots')).slots as { id: number; name: string }[];
    await call(`/slots/${slotList[0]!.id}/entry`, 'PUT', { entryId: hades.id });

    // Celeste: an old playthrough with unknown dates
    await call(`/entries/${celeste.id}/playthroughs`, 'POST', { outcome: 'abandoned' });

    // Hollow Knight: paused, in Secondary
    await call(`/slots/${slotList[1]!.id}/entry`, 'PUT', {
        entryId: knight.id,
        date: '2025-03-01'
    });
    await call(`/entries/${knight.id}/pause`, 'POST');

    // Outer Wilds: unplayed but personalised
    await call(`/entries/${wilds.id}`, 'PATCH', { rating: 4 });
    await call(`/entries/${wilds.id}/notes`, 'POST', { body: 'Spoiler-free please' });
    await call(`/entries/${wilds.id}/notes`, 'POST', { body: 'Great opener', public: true });

    await call('/slots', 'POST', { name: 'Couch co-op' });
    const queue = (await call('/lists', 'POST', { name: 'Up next' })).list.id;
    const cozy = (await call('/lists', 'POST', { name: 'Cozy' })).list.id;
    for (const e of [knight, hades, wilds])
        await call(`/lists/${queue}/items`, 'POST', { entryId: e.id });
    await call(`/lists/${cozy}/items`, 'POST', { entryId: celeste.id });
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
        expect(file.slots.map((x) => [x.name, x.igdbId])).toEqual([
            ['Main', 1],
            ['Secondary', 3],
            ['Palate cleanser', null],
            ['Couch co-op', null]
        ]);
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
        expect(theirs.slots.map((x) => x.igdbId)).toEqual([null, null, null]);
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

        const b = await setupApi(); // a fresh install: no IGDB, nothing cached
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).toMatchObject({
            dryRun: false,
            games: { added: 4, updated: 0, unchanged: 0 },
            playthroughs: { added: 4, duplicates: 0, skipped: 0 },
            lists: { created: 2, itemsAdded: 4 },
            slots: { created: 1, filled: 2 },
            notes: []
        });
        expect(stable(await exportOf(b))).toEqual(stable(file));

        // and the restored data behaves like the original
        const entries = (await b.call('/entries?sort=title')).entries as {
            game: { name: string };
            status: string;
            slotId: number | null;
        }[];
        expect(entries.map((e) => [e.game.name, e.status, e.slotId !== null])).toEqual([
            ['Celeste', 'abandoned', false],
            ['Hades', 'playing', true],
            ['Hollow Knight', 'paused', true],
            ['Outer Wilds', 'unplayed', false]
        ]);
        expect((await b.call('/entries?view=backlog')).entries).toHaveLength(1);
    });

    it('works without IGDB because the file carries the metadata', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = await exportOf(a);
        const b = await setupApi();
        await importFile(b, file, true);
        const hades = (await b.call('/entries?q=hades')).entries[0];
        expect(hades.game).toMatchObject({ name: 'Hades', coverImageId: 'co1', igdbRating: 80 });
        expect(hades.game.genres.length).toBeGreaterThan(0);
        expect(hades.game.ttb.normally).toBe(1200);
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
            lists: { created: 0, itemsAdded: 0 },
            slots: { created: 0, filled: 0 }
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
        expect(b.db.select().from(games).all()).toHaveLength(0);

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
        await b.call(`/lists/${list}/items`, 'POST', { entryId: extra.id });
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
        const merged = (await b.call(`/lists/${list}`)).list.entries as {
            game: { name: string };
        }[];
        // your Outer Wilds stays first; Hollow Knight and Hades follow in the file's order
        expect(merged.map((e) => e.game.name)).toEqual(['Outer Wilds', 'Hollow Knight', 'Hades']);
    });

    it('never disturbs an occupied slot or takes a game that is in progress elsewhere', async () => {
        const { file, b } = await scenario();
        const slots = (await b.call('/slots')).slots as { id: number; name: string }[];
        // Main is already taken by a different game in this account
        const knight = await b.add(3);
        await b.call(`/slots/${slots[0]!.id}/entry`, 'PUT', {
            entryId: knight.id,
            date: '2025-05-01'
        });
        const res = await importFile(b, file, true);

        const after = (await b.call('/slots')).slots as {
            name: string;
            entry: { game: { name: string } } | null;
        }[];
        expect(after[0]).toMatchObject({
            name: 'Main',
            entry: { game: { name: 'Hollow Knight' } }
        });
        expect(
            res.report.notes.some(
                (n: string) => n.includes('Main is occupied') && n.includes('Hades')
            )
        ).toBe(true);
        // The file puts Knight in Secondary, but here it's already in Main
        expect(
            res.report.notes.some(
                (n: string) => n.includes('Hollow Knight') && n.includes('already in Main')
            )
        ).toBe(true);
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

    it('adds games the cache has never seen using the file snapshot', async () => {
        const { file, b } = await scenario();
        const withNew: ExportFile = JSON.parse(JSON.stringify(file));
        const clone = JSON.parse(JSON.stringify(withNew.games[0]!));
        clone.igdbId = 999;
        clone.game.name = 'Brand New Game';
        clone.status = 'unplayed';
        clone.playthroughs = [];
        clone.tags = [];
        withNew.games.push(clone);
        const res = await importFile(b, withNew, true);
        expect(res.status).toBe(200);
        expect((await b.call('/entries?q=brand')).entries[0].game.name).toBe('Brand New Game');
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
        file.slots[0]!.igdbId = 424242;
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
            expect.arrayContaining([
                'games.4.igdbId',
                'slots.0.igdbId',
                'lists.0.games.3',
                'games.0.playthroughs'
            ])
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
        file.slots = [];
        file.lists = [];
        const res = await importFile(s, file, false);
        expect(res.status).toBe(400);
        expect(res.details).toHaveLength(50);
        expect(res.totalIssues).toBeGreaterThanOrEqual(80);
    });

    it('stops at the slot limit gracefully instead of failing', async () => {
        const a = await setupApi();
        for (let i = 0; i < 7; i++) await a.call('/slots', 'POST', { name: `Extra ${i}` });
        const file = await exportOf(a); // 10 slots
        const b = await setupApi();
        await b.call('/slots', 'POST', { name: 'Only mine' });
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report.slots.created).toBe(6); // 4 slots already exist, so 6 more fit
        expect(res.report.notes.join('\n')).toMatch(/already have 10 slots/);
        expect(((await b.call('/slots')).slots as unknown[]).length).toBe(10);
    });
});

describe('grids and tier lists in the export', () => {
    /** One grid and one tier list over games that are not in the collection at all. */
    async function social(s: Api) {
        const grid = (await s.call('/grids', 'POST', { title: 'Best of', cols: 3, rows: 2 })).grid;
        await s.call(`/grids/${grid.id}/cells/0`, 'PUT', { label: 'Best soundtrack', igdbId: 2 });
        await s.call(`/grids/${grid.id}/cells/4`, 'PUT', { label: 'Just a label' });
        await s.call(`/grids/${grid.id}/cells/5`, 'PUT', { igdbId: 3 });
        const tl = (await s.call('/tier-lists', 'POST', { title: 'Ranked', description: 'D' }))
            .tierList;
        const [S, A] = [tl.tiers[0].id, tl.tiers[1].id];
        await s.call(`/tier-lists/${tl.id}/tiers/${A}`, 'PATCH', { name: 'Great', color: 'pink' });
        for (const [g, tier] of [
            [1, S],
            [2, S],
            [3, A]
        ] as const)
            await s.call(`/tier-lists/${tl.id}/items`, 'POST', { igdbId: g, tierId: tier });
        await s.call(`/tier-lists/${tl.id}/items`, 'POST', { igdbId: 4 });
        // put game 2 before game 1 in S
        await s.call(`/tier-lists/${tl.id}/items/move`, 'PUT', {
            igdbId: 2,
            tierId: S,
            toIndex: 0
        });
        return { grid, tl };
    }

    it('exports them, with the games they use', async () => {
        const s = await setupApi();
        await social(s);
        const file = await exportOf(s);
        expect(file.games).toEqual([]); // none of these games is in the collection
        expect(file.grids).toHaveLength(1);
        expect(file.grids[0]).toMatchObject({ title: 'Best of', cols: 3, rows: 2 });
        expect(
            file.grids[0]!.cells.map((c) => [c.position, c.label, c.game?.game.name ?? null])
        ).toEqual([
            [0, 'Best soundtrack', 'Celeste'],
            [4, 'Just a label', null],
            [5, '', 'Hollow Knight']
        ]);
        expect(file.grids[0]!.cells[0]!.game!.game.genres.length).toBeGreaterThan(0);
        const tl = file.tierLists[0]!;
        expect(tl).toMatchObject({ title: 'Ranked', description: 'D' });
        expect(tl.tiers.map((t) => [t.name, t.color, t.games.map((g) => g.game.name)])).toEqual([
            ['S', 'red', ['Celeste', 'Hades']],
            ['Great', 'pink', ['Hollow Knight']],
            ['B', 'yellow', []],
            ['C', 'green', []],
            ['D', 'blue', []],
            ['F', 'purple', []]
        ]);
        expect(tl.unranked.map((g) => g.game.name)).toEqual(['Outer Wilds']);
    });

    it('restores them exactly on a fresh install, without IGDB, and keeps the games cached', async () => {
        const a = await setupApi();
        await social(a);
        const file = await exportOf(a);
        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).toMatchObject({
            grids: { created: 1, skipped: 0 },
            tierLists: { created: 1, skipped: 0 },
            notes: []
        });
        expect(stable(await exportOf(b))).toEqual(stable(file));
        const grid = (await b.call('/grids')).grids[0];
        expect(grid).toMatchObject({ title: 'Best of', filled: 2, covers: ['co2', 'co3'] });
    });

    it('is idempotent, keeps a grid or tier list you already have by title, and a dry run writes nothing', async () => {
        const a = await setupApi();
        await social(a);
        const file = await exportOf(a);
        const b = await setupApi();

        const preview = await importFile(b, file, false);
        expect(preview.report).toMatchObject({
            dryRun: true,
            grids: { created: 1 },
            tierLists: { created: 1 }
        });
        expect((await b.call('/grids')).grids).toEqual([]);
        expect((await b.call('/tier-lists')).tierLists).toEqual([]);

        await importFile(b, file, true);
        const before = stable(await exportOf(b));
        // edit the copy; a second import must not overwrite or duplicate it
        const g = (await b.call('/grids')).grids[0];
        await b.call(`/grids/${g.id}`, 'PATCH', { title: 'best OF' });
        const again = await importFile(b, file, true);
        expect(again.report).toMatchObject({
            grids: { created: 0, skipped: 1 },
            tierLists: { created: 0, skipped: 1 }
        });
        expect(
            again.report.notes.some(
                (n: string) => n.includes('Best of') && n.includes('already have')
            )
        ).toBe(true);
        expect((await b.call('/grids')).grids).toHaveLength(1);
        expect(stable(await exportOf(b)).tierLists).toEqual(before.tierLists);
    });

    it('still reads files from before grids and tier lists existed', async () => {
        const a = await setupApi();
        await richCollection(a);
        const file = (await exportOf(a)) as Record<string, unknown>;
        delete file.grids;
        delete file.tierLists;
        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(200);
        expect(res.report).toMatchObject({
            grids: { created: 0, skipped: 0 },
            tierLists: { created: 0, skipped: 0 }
        });
    });

    it('rejects malformed grids and tier lists, pointing at the problem', async () => {
        const a = await setupApi();
        await social(a);
        const file = await exportOf(a);
        file.grids[0]!.cells[1]!.position = 6; // outside 3x2
        file.grids[0]!.cells[2]!.position = 0; // twice
        file.tierLists[0]!.tiers[1]!.games.push(file.tierLists[0]!.tiers[0]!.games[0]!);
        const b = await setupApi();
        const res = await importFile(b, file, true);
        expect(res.status).toBe(400);
        const where = (res.details as { path: string }[]).map((d) => d.path);
        expect(where).toEqual(
            expect.arrayContaining([
                'grids.0.cells.1.position',
                'grids.0.cells.2.position',
                'tierLists.0.tiers'
            ])
        );
        expect((await b.call('/grids')).grids).toEqual([]);
        // a colour that isn't in the palette
        const clean = await exportOf(a);
        clean.tierLists[0]!.tiers[0]!.color = 'mauve' as never;
        const bad = await importFile(b, clean, true);
        expect(bad.status).toBe(400);
        expect((bad.details as { path: string }[]).map((d) => d.path)).toContain(
            'tierLists.0.tiers.0.color'
        );
    });

    it('does not export another user’s grids or tier lists', async () => {
        const s = await setupApi();
        await social(s);
        const other = await s.secondUser();
        const theirs = (await s.call(
            '/data/export',
            'GET',
            undefined,
            other
        )) as unknown as ExportFile;
        expect(theirs.grids).toEqual([]);
        expect(theirs.tierLists).toEqual([]);
    });
});
