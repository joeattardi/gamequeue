import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { SMART_LIST_PRESETS, type ExportFile } from '@gamequeue/shared';
import { entries, smartLists } from '../src/db/schema.js';
import { PC, SWITCH, setupApi } from './api.js';

const DAY = 86_400_000;

async function setup() {
    const s = await setupApi();
    // Hades 1200 min, Celeste 480 min, Hollow Knight 1200 min, Outer Wilds unknown
    const hades = await s.add(1, [PC.id], ['roguelike']);
    const celeste = await s.add(2, [SWITCH.id], ['cozy']);
    const knight = await s.add(3, [PC.id]);
    const wilds = await s.add(4, [PC.id], ['cozy']);
    const make = async (body: Record<string, unknown>) =>
        s.call('/smart-lists', 'POST', { name: 'Test', sort: 'title', ...body });
    const names = (list: Record<string, any>) =>
        list.entries.map((e: { game: { name: string } }) => e.game.name);
    const backdate = (entryId: number, over: Partial<typeof entries.$inferInsert>) =>
        s.db.update(entries).set(over).where(eq(entries.id, entryId)).run();
    return { ...s, hades, celeste, knight, wilds, make, names, backdate };
}

describe('smart lists', () => {
    it('creates, reads, updates, summarises and deletes', async () => {
        const { call, make, names } = await setup();
        const created = await make({
            name: 'Cozy',
            rules: [{ field: 'tag', anyOf: ['cozy'] }]
        });
        expect(created.status).toBe(201);
        const id = created.smartList.id as number;
        expect(names(created.smartList)).toEqual(['Celeste', 'Outer Wilds']);
        expect(created.smartList).toMatchObject({
            sort: 'title',
            dir: 'asc',
            ruleText: ['Tagged cozy']
        });

        expect((await call('/smart-lists')).smartLists).toEqual([
            {
                id,
                name: 'Cozy',
                count: 2,
                covers: ['co2', 'co4'],
                ruleText: ['Tagged cozy']
            }
        ]);

        const updated = await call(`/smart-lists/${id}`, 'PUT', {
            name: 'Short',
            rules: [{ field: 'ttb', op: 'lte', value: 600 }],
            sort: 'ttb'
        });
        expect(updated.smartList).toMatchObject({ name: 'Short', sort: 'ttb', dir: 'asc' });
        expect(names(updated.smartList)).toEqual(['Celeste']);

        expect((await call(`/smart-lists/${id}`, 'DELETE')).status).toBe(200);
        expect((await call(`/smart-lists/${id}`)).status).toBe(404);
        expect((await call('/smart-lists')).smartLists).toEqual([]);
    });

    it('tracks the collection: membership is computed, not stored', async () => {
        const { call, make, names, wilds } = await setup();
        const { smartList } = await make({
            rules: [
                { field: 'status', anyOf: ['unplayed'] },
                { field: 'tag', anyOf: ['cozy'] }
            ]
        });
        expect(names(smartList)).toEqual(['Celeste', 'Outer Wilds']);
        await call(`/entries/${wilds.id}/start`, 'POST', {});
        expect(names((await call(`/smart-lists/${smartList.id}`)).smartList)).toEqual(['Celeste']);
        await call(`/entries/${wilds.id}`, 'DELETE');
        expect(names((await call(`/smart-lists/${smartList.id}`)).smartList)).toEqual(['Celeste']);
    });

    it('matches by platform and describes it with the platform name', async () => {
        const { make, names } = await setup();
        const { smartList } = await make({ rules: [{ field: 'platform', anyOf: [SWITCH.id] }] });
        expect(names(smartList)).toEqual(['Celeste']);
        expect(smartList.ruleText).toEqual([`Platform is ${SWITCH.name}`]);
    });

    it('uses time to beat and treats unknown as no match', async () => {
        const { make, names } = await setup();
        const rules = [{ field: 'ttb', op: 'lte', value: 600 }];
        expect(names((await make({ rules })).smartList)).toEqual(['Celeste']);
        const unknown = await make({ rules: [{ field: 'ttb', op: 'unknown' }] });
        expect(names(unknown.smartList)).toEqual(['Outer Wilds']);
    });

    it('works out how long ago things happened', async () => {
        const { make, names, backdate, hades, celeste, knight, call } = await setup();
        const now = Date.now();
        await backdate(hades.id, { addedAt: now - 400 * DAY });
        await backdate(celeste.id, { addedAt: now - 100 * DAY });
        const neglected = await make({
            rules: [
                { field: 'status', anyOf: ['unplayed'] },
                { field: 'addedDays', op: 'gte', value: 365 }
            ],
            sort: 'added',
            dir: 'asc'
        });
        expect(names(neglected.smartList)).toEqual(['Hades']);

        // A paused game untouched for 45 days
        await call(`/entries/${knight.id}/start`, 'POST', {});
        await call(`/entries/${knight.id}/pause`, 'POST');
        await backdate(knight.id, { updatedAt: now - 45 * DAY });
        const dust = await make({
            rules: [
                { field: 'status', anyOf: ['paused'] },
                { field: 'changedDays', op: 'gte', value: 30 }
            ]
        });
        expect(names(dust.smartList)).toEqual(['Hollow Knight']);
    });

    it('finds replay candidates from finished playthroughs', async () => {
        const { call, make, names, hades, celeste } = await setup();
        const finish = async (id: number, endedOn: string, rating: number) => {
            await call(`/entries/${id}/playthroughs`, 'POST', {
                outcome: 'finished',
                endedOn
            });
            await call(`/entries/${id}`, 'PATCH', { rating });
        };
        await finish(hades.id, '2020-01-01', 5);
        await finish(celeste.id, new Date().toISOString().slice(0, 10), 5);
        const preset = SMART_LIST_PRESETS.find((p) => p.key === 'replay-candidates')!;
        const res = await make({ ...preset, name: preset.name });
        expect(names(res.smartList)).toEqual(['Hades']);
    });

    it('lists games finished in a year, counting replays and skipping unknown dates', async () => {
        const { call, make, names, hades, celeste, knight, wilds } = await setup();
        const finish = (id: number, endedOn?: string) =>
            call(`/entries/${id}/playthroughs`, 'POST', { outcome: 'finished', endedOn });
        await finish(hades.id, '2026-02-01');
        await finish(celeste.id, '2025-12-31');
        await finish(celeste.id, '2026-03-03'); // finished twice; once in 2026
        await finish(knight.id, '2025-06-06');
        await finish(wilds.id); // no date
        await call(`/entries/${knight.id}/playthroughs`, 'POST', {
            outcome: 'abandoned',
            endedOn: '2026-01-01'
        });
        const rules = [{ field: 'finishedYear', anyOf: [2026] }];
        const { smartList } = await make({ rules });
        expect(names(smartList)).toEqual(['Celeste', 'Hades']);
        expect(smartList.ruleText).toEqual(['Finished in 2026']);
        expect(
            names(
                (await make({ rules: [{ field: 'finishedYear', anyOf: [2025, 2026] }] })).smartList
            )
        ).toEqual(['Celeste', 'Hades', 'Hollow Knight']);
        const entry = (await call(`/entries/${celeste.id}`)).entry;
        expect(entry.finishedYears).toEqual([2025, 2026]);
    });

    it('sorts by the chosen field, missing values last', async () => {
        const { make, names } = await setup();
        const rules = [{ field: 'status', anyOf: ['unplayed'] }];
        expect(names((await make({ rules, sort: 'ttb' })).smartList)).toEqual([
            'Celeste',
            'Hades',
            'Hollow Knight',
            'Outer Wilds'
        ]);
        expect(names((await make({ rules, sort: 'ttb', dir: 'desc' })).smartList)).toEqual([
            'Hades',
            'Hollow Knight',
            'Celeste',
            'Outer Wilds'
        ]);
    });

    it('validates input', async () => {
        const { make, call } = await setup();
        const ok = [{ field: 'tag', anyOf: ['a'] }];
        expect((await make({ rules: [] })).status).toBe(400);
        expect((await make({ name: ' ', rules: ok })).status).toBe(400);
        expect((await make({ rules: [{ field: 'ttb', op: 'gte' }] })).status).toBe(400);
        expect((await make({ rules: ok, sort: 'colour' })).status).toBe(400);
        expect((await call('/smart-lists/abc')).status).toBe(404);
        expect((await call('/smart-lists/999', 'PUT', { name: 'x', rules: ok })).status).toBe(404);
    });

    it("keeps each user's smart lists private to the owner's API", async () => {
        const { make, call, secondUser } = await setup();
        const other = await secondUser();
        const id = (await make({ rules: [{ field: 'tag', anyOf: ['cozy'] }] })).smartList.id;
        expect((await call(`/smart-lists/${id}`, 'GET', undefined, other)).status).toBe(404);
        expect((await call(`/smart-lists/${id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect((await call('/smart-lists', 'GET', undefined, other)).smartLists).toEqual([]);
        expect((await call(`/smart-lists/${id}/export.csv`, 'GET', undefined, other)).status).toBe(
            404
        );
    });

    it('requires login', async () => {
        const { app } = await setup();
        expect((await app.request('/api/smart-lists')).status).toBe(401);
    });
});

describe('random pick from a smart list', () => {
    it('draws only from the list, still skipping games that are not unplayed', async () => {
        const { call, make, hades, wilds, celeste } = await setup();
        const { smartList } = await make({
            rules: [{ field: 'tag', anyOf: ['cozy', 'roguelike'] }]
        });
        await call(`/entries/${celeste.id}/start`, 'POST', {});
        const seen = new Set<number>();
        for (let i = 0; i < 30; i++) {
            const res = await call('/pick', 'POST', {
                source: { type: 'smart', smartListId: smartList.id }
            });
            expect(res.candidateCount).toBe(2);
            seen.add(res.entry.id);
        }
        expect([...seen].sort()).toEqual([hades.id, wilds.id].sort());
        expect(
            (await call('/pick', 'POST', { source: { type: 'smart', smartListId: 999 } })).status
        ).toBe(404);
    });
});

describe('CSV export', () => {
    async function csvOf(s: Awaited<ReturnType<typeof setup>>, path: string, cookie = s.cookie) {
        const res = await s.app.request(`/api${path}`, { headers: { cookie } });
        // Response.text() drops the BOM; decode by hand so the tests see (and require) it
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
        if (res.status === 200) expect(text.startsWith('\uFEFF')).toBe(true);
        return { res, text };
    }

    it('exports a smart list in its sort order', async () => {
        const s = await setup();
        const { smartList } = await s.make({
            name: 'Quick, wins',
            rules: [{ field: 'status', anyOf: ['unplayed'] }],
            sort: 'ttb'
        });
        const { res, text } = await csvOf(s, `/smart-lists/${smartList.id}/export.csv`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/csv; charset=UTF-8');
        expect(res.headers.get('content-disposition')).toContain('filename="quick-wins.csv"');
        const lines = text.slice(1).trim().split('\r\n');
        expect(lines[0]).toMatch(/^Title,Status,Platforms,Tags,Genres/);
        expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual([
            'Celeste',
            'Hades',
            'Hollow Knight',
            'Outer Wilds'
        ]);
        expect(lines[1]).toContain(
            'Celeste,unplayed,Nintendo Switch,cozy,Role-playing (RPG),,no,80,8,'
        );
    });

    it('exports a list or the queue in list order, and the whole collection', async () => {
        const s = await setup();
        const list = (await s.call('/lists', 'POST', { name: 'Mine' })).list.id;
        for (const e of [s.wilds, s.hades])
            await s.call(`/lists/${list}/items`, 'POST', { entryId: e.id });
        const rows = (text: string) =>
            text
                .slice(1)
                .trim()
                .split('\r\n')
                .slice(1)
                .map((l) => l.split(',')[0]);
        expect(rows((await csvOf(s, `/lists/${list}/export.csv`)).text)).toEqual([
            'Outer Wilds',
            'Hades'
        ]);

        await s.call('/queue/items', 'POST', { entryId: s.knight.id });
        const queueId = (await s.call('/queue')).list.id;
        expect(rows((await csvOf(s, `/lists/${queueId}/export.csv`)).text)).toEqual([
            'Hollow Knight'
        ]);

        const all = await csvOf(s, '/data/export.csv');
        expect(all.res.headers.get('content-disposition')).toContain('gamequeue-collection.csv');
        expect(rows(all.text)).toEqual(['Celeste', 'Hades', 'Hollow Knight', 'Outer Wilds']);
    });

    it('is private and neutralises formula-like text', async () => {
        const s = await setup();
        await s.call(`/entries/${s.hades.id}`, 'PATCH', { notes: '=HYPERLINK("http://x")' });
        const all = await csvOf(s, '/data/export.csv');
        expect(all.text).toContain(`"'=HYPERLINK(""http://x"")"`);
        expect((await s.app.request('/api/data/export.csv')).status).toBe(401);
        expect((await s.app.request('/api/lists/1/export.csv')).status).toBe(401);
    });
});

describe('smart lists in export, import and the public profile', () => {
    it('round-trips through export and import, merging by name', async () => {
        const s = await setup();
        await s.make({ name: 'Cozy', rules: [{ field: 'tag', anyOf: ['cozy'] }], sort: 'rating' });
        const file = (await s.call('/data/export')) as unknown as ExportFile;
        expect(file.smartLists).toEqual([
            {
                name: 'Cozy',
                description: '',
                rules: [{ field: 'tag', anyOf: ['cozy'] }],
                sort: 'rating',
                dir: 'desc'
            }
        ]);

        // A fresh account gets the list; importing again changes nothing
        const { call: other } = await setup();
        const first = await other('/data/import?commit=true', 'POST', file);
        expect(first.report.smartLists).toEqual({ created: 1 });
        const again = await other('/data/import?commit=true', 'POST', file);
        expect(again.report.smartLists).toEqual({ created: 0 });
        expect((await other('/smart-lists')).smartLists).toHaveLength(1);

        // A dry run reports but writes nothing
        const third = await setup();
        const dry = await third.call('/data/import', 'POST', file);
        expect(dry.report.smartLists).toEqual({ created: 1 });
        expect((await third.call('/smart-lists')).smartLists).toEqual([]);
    });

    it('accepts older files without smartLists', async () => {
        const s = await setup();
        const file = (await s.call('/data/export')) as unknown as Record<string, unknown>;
        delete file.smartLists;
        const res = await s.call('/data/import', 'POST', file);
        expect(res.report.smartLists).toEqual({ created: 0 });
    });

    it('shows smart lists on the public profile without notes or private fields', async () => {
        const s = await setup();
        await s.call(`/entries/${s.celeste.id}`, 'PATCH', { notes: 'secret note' });
        await s.make({ name: 'Cozy', rules: [{ field: 'tag', anyOf: ['cozy'] }] });
        const me = (await s.call('/auth/me')).user.username as string;
        const res = await s.app.request(`/api/profiles/${me}`);
        const text = await res.text();
        const { profile } = JSON.parse(text);
        expect(profile.smartLists).toEqual([
            {
                id: expect.any(Number),
                name: 'Cozy',
                total: 2,
                covers: expect.any(Array)
            }
        ]);
        const page = await (
            await s.app.request(`/api/profiles/${me}/smart-lists/${profile.smartLists[0].id}`)
        ).text();
        expect(JSON.parse(page)).toMatchObject({
            name: 'Cozy',
            ruleText: ['Tagged cozy'],
            total: 2,
            entries: [
                expect.objectContaining({ game: expect.objectContaining({ name: 'Celeste' }) }),
                expect.objectContaining({ game: expect.objectContaining({ name: 'Outer Wilds' }) })
            ]
        });
        expect(page).not.toContain('secret note');
        expect(text).not.toContain('secret note');
        expect(s.db.select().from(smartLists).all()).toHaveLength(1);
    });
});
