import { describe, expect, it } from 'vitest';
import { setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const makeList = async (name: string) =>
        (await s.call('/lists', 'POST', { name })).list.id as number;
    const names = (list: Record<string, any>) => list.entries.map((e: any) => e.game.name);
    return { ...s, makeList, names };
}

describe('lists', () => {
    it('creates, renames, summarises and deletes lists', async () => {
        const { call, add, makeList } = await setup();
        const id = await makeList('Up next');
        await makeList('cozy games');
        expect((await call('/lists', 'POST', { name: '   ' })).status).toBe(400);

        const e = await add(1);
        await call(`/lists/${id}/items`, 'POST', { entryId: e.id });
        expect((await call('/lists')).lists).toEqual([
            { id: expect.any(Number), name: 'cozy games', count: 0 },
            { id, name: 'Up next', count: 1 }
        ]);

        expect((await call(`/lists/${id}`, 'PATCH', { name: 'Queue' })).list.name).toBe('Queue');
        expect((await call(`/lists/${id}`, 'DELETE')).status).toBe(200);
        expect((await call(`/lists/${id}`)).status).toBe(404);
        // the game itself is untouched
        expect((await call(`/entries/${e.id}`)).status).toBe(200);
    });

    it('keeps games in the order they were added and lets one game be in many lists', async () => {
        const { call, add, makeList, names } = await setup();
        const a = await add(1);
        const b = await add(2);
        const c = await add(3);
        const queue = await makeList('Queue');
        const other = await makeList('Other');
        for (const e of [c, a, b]) await call(`/lists/${queue}/items`, 'POST', { entryId: e.id });
        await call(`/lists/${other}/items`, 'POST', { entryId: a.id });

        expect(names((await call(`/lists/${queue}`)).list)).toEqual([
            'Hollow Knight',
            'Hades',
            'Celeste'
        ]);
        const entry = (await call(`/entries/${a.id}`)).entry;
        expect(entry.lists.map((l: { name: string }) => l.name)).toEqual(['Other', 'Queue']);
    });

    it('adding a game twice is a no-op', async () => {
        const { call, add, makeList } = await setup();
        const e = await add(1);
        const id = await makeList('L');
        await call(`/lists/${id}/items`, 'POST', { entryId: e.id });
        const again = await call(`/lists/${id}/items`, 'POST', { entryId: e.id });
        expect(again.status).toBe(200);
        expect(again.list.entries).toHaveLength(1);
    });

    it('reorders, and rejects anything that is not exactly the same games', async () => {
        const { call, add, makeList, names } = await setup();
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        const id = await makeList('L');
        for (const e of [a, b, c]) await call(`/lists/${id}/items`, 'POST', { entryId: e.id });

        const res = await call(`/lists/${id}/order`, 'PUT', { entryIds: [c.id, a.id, b.id] });
        expect(names(res.list)).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        expect(names((await call(`/lists/${id}`)).list)).toEqual([
            'Hollow Knight',
            'Hades',
            'Celeste'
        ]);

        for (const entryIds of [[a.id, b.id], [a.id, b.id, c.id, 999], [a.id, a.id, b.id], []]) {
            expect((await call(`/lists/${id}/order`, 'PUT', { entryIds })).status).toBe(400);
        }
    });

    it('removes a game and keeps the rest in order, then still accepts new ones', async () => {
        const { call, add, makeList, names } = await setup();
        const [a, b, c, d] = [await add(1), await add(2), await add(3), await add(4)];
        const id = await makeList('L');
        for (const e of [a, b, c]) await call(`/lists/${id}/items`, 'POST', { entryId: e.id });
        const res = await call(`/lists/${id}/items/${b.id}`, 'DELETE');
        expect(names(res.list)).toEqual(['Hades', 'Hollow Knight']);
        await call(`/lists/${id}/items`, 'POST', { entryId: d.id });
        expect(names((await call(`/lists/${id}`)).list)).toEqual([
            'Hades',
            'Hollow Knight',
            'Outer Wilds'
        ]);
        // removing something that isn't there is harmless
        expect((await call(`/lists/${id}/items/${b.id}`, 'DELETE')).status).toBe(200);
    });

    it('drops a game from every list when it leaves the collection', async () => {
        const { call, add, makeList } = await setup();
        const e = await add(1);
        const id = await makeList('L');
        await call(`/lists/${id}/items`, 'POST', { entryId: e.id });
        await call(`/entries/${e.id}`, 'DELETE');
        expect((await call(`/lists/${id}`)).list.entries).toEqual([]);
        expect((await call('/lists')).lists[0].count).toBe(0);
    });

    it('only holds your own collection entries and is private to you', async () => {
        const { call, add, makeList, secondUser } = await setup();
        const e = await add(1);
        const id = await makeList('Mine');
        const other = await secondUser();

        expect((await call(`/lists/${id}`, 'GET', undefined, other)).status).toBe(404);
        expect((await call(`/lists/${id}/items`, 'POST', { entryId: e.id }, other)).status).toBe(
            404
        );
        expect((await call(`/lists/${id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect((await call('/lists', 'GET', undefined, other)).lists).toEqual([]);

        const theirs = (await call('/lists', 'POST', { name: 'Theirs' }, other)).list.id;
        expect(
            (await call(`/lists/${theirs}/items`, 'POST', { entryId: e.id }, other)).status
        ).toBe(404);
        expect((await call(`/lists/${id}/items`, 'POST', { entryId: 99999 })).status).toBe(404);
    });

    it('requires authentication', async () => {
        const { app } = await setup();
        expect((await app.request('/api/lists')).status).toBe(401);
        expect(
            (
                await app.request('/api/pick', {
                    method: 'POST',
                    headers: { origin: 'http://localhost' }
                })
            ).status
        ).toBe(401);
    });
});
