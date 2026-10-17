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
    await call(`/entries/${wilds.id}`, 'PATCH', {
        rating: 4,
        notes: 'Spoiler-free please',
        ttbOverrideMinutes: 90
    });

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
            { name: 'Up next', games: [3, 1, 4] },
            { name: 'Cozy', games: [2] }
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
        await b.call(`/entries/${hades.id}`, 'PATCH', { rating: 5, notes: 'My own notes' });
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
        expect(merged).toMatchObject({ rating: 5, notes: 'My own notes' });
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
