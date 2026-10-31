import { describe, expect, it } from 'vitest';
import { setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const makeList = async (name: string) =>
        (await s.call('/lists', 'POST', { name })).list.id as number;
    const names = (list: Record<string, any>) => list.items.map((e: any) => e.game.name);
    return { ...s, makeList, names };
}

describe('lists', () => {
    it('creates, renames, summarises and deletes lists', async () => {
        const { call, add, makeList } = await setup();
        const id = await makeList('Up next');
        await makeList('cozy games');
        expect((await call('/lists', 'POST', { name: '   ' })).status).toBe(400);

        const e = await add(1);
        await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });
        expect((await call('/lists')).lists).toEqual([
            { id: expect.any(Number), name: 'cozy games', count: 0, covers: [] },
            { id, name: 'Up next', count: 1, covers: [expect.any(String)] }
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
        for (const e of [c, a, b])
            await call(`/lists/${queue}/items`, 'POST', { igdbId: e.game.id });
        await call(`/lists/${other}/items`, 'POST', { igdbId: a.game.id });

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
        await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });
        const again = await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });
        expect(again.status).toBe(200);
        expect(again.list.items).toHaveLength(1);
    });

    it('reorders, and rejects anything that is not exactly the same games', async () => {
        const { call, add, makeList, names } = await setup();
        const [a, b, c] = [await add(1), await add(2), await add(3)];
        const id = await makeList('L');
        for (const e of [a, b, c]) await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });

        const res = await call(`/lists/${id}/order`, 'PUT', {
            igdbIds: [c.game.id, a.game.id, b.game.id]
        });
        expect(names(res.list)).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        expect(names((await call(`/lists/${id}`)).list)).toEqual([
            'Hollow Knight',
            'Hades',
            'Celeste'
        ]);

        const [x, y, z] = [a.game.id, b.game.id, c.game.id];
        for (const igdbIds of [[x, y], [x, y, z, 999], [x, x, y], []]) {
            expect((await call(`/lists/${id}/order`, 'PUT', { igdbIds })).status).toBe(400);
        }
    });

    it('removes a game and keeps the rest in order, then still accepts new ones', async () => {
        const { call, add, makeList, names } = await setup();
        const [a, b, c, d] = [await add(1), await add(2), await add(3), await add(4)];
        const id = await makeList('L');
        for (const e of [a, b, c]) await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });
        const res = await call(`/lists/${id}/items/${b.game.id}`, 'DELETE');
        expect(names(res.list)).toEqual(['Hades', 'Hollow Knight']);
        await call(`/lists/${id}/items`, 'POST', { igdbId: d.game.id });
        expect(names((await call(`/lists/${id}`)).list)).toEqual([
            'Hades',
            'Hollow Knight',
            'Outer Wilds'
        ]);
        // removing something that isn't there is harmless
        expect((await call(`/lists/${id}/items/${b.game.id}`, 'DELETE')).status).toBe(200);
    });

    it('keeps a game on your lists, as one you no longer own, when it leaves the collection', async () => {
        const { call, add, makeList } = await setup();
        const e = await add(1);
        const id = await makeList('L');
        await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id });
        await call(`/entries/${e.id}`, 'DELETE');
        const list = (await call(`/lists/${id}`)).list;
        expect(list.items).toHaveLength(1);
        expect(list.items[0]).toMatchObject({ igdbId: 1, entry: null, game: { name: 'Hades' } });
        expect((await call('/lists')).lists[0].count).toBe(1);
    });

    it('holds games that are not in the collection, and shows the status of the ones that are', async () => {
        const { call, add, makeList, names } = await setup();
        const id = await makeList('Maybe');
        const owned = await add(1);
        await call(`/entries/${owned.id}/start`, 'POST', {});
        // game 2 is on IGDB but not in the collection
        const res = await call(`/lists/${id}/items`, 'POST', { igdbId: 2 });
        expect(res.status).toBe(200);
        await call(`/lists/${id}/items`, 'POST', { igdbId: owned.game.id });
        const list = (await call(`/lists/${id}`)).list;
        expect(names(list)).toEqual(['Celeste', 'Hades']);
        expect(list.items.map((i: any) => [i.game.name, i.entry?.status ?? null])).toEqual([
            ['Celeste', null],
            ['Hades', 'playing']
        ]);
        // the unowned game doesn't count towards the collection, and can be added to it later
        expect((await call('/entries')).total).toBe(1);
        expect((await call('/stats')).stats.overview.total).toBe(1);
        expect((await call('/entries', 'POST', { igdbId: 2, platformIds: [6] })).status).toBe(201);
        expect(
            (await call(`/lists/${id}`)).list.items.map((i: any) => i.entry?.status ?? null)
        ).toEqual(['unplayed', 'playing']);
        // and removing, reordering and deleting work for it too
        await call(`/lists/${id}/order`, 'PUT', { igdbIds: [1, 2] });
        expect(names((await call(`/lists/${id}`)).list)).toEqual(['Hades', 'Celeste']);
        expect(names((await call(`/lists/${id}/items/2`, 'DELETE')).list)).toEqual(['Hades']);
    });

    it('rejects a game IGDB does not know', async () => {
        const { call, makeList } = await setup();
        const id = await makeList('L');
        expect((await call(`/lists/${id}/items`, 'POST', { igdbId: 424242 })).status).toBe(404);
    });

    it('is private to you', async () => {
        const { call, add, makeList, secondUser } = await setup();
        const e = await add(1);
        const id = await makeList('Mine');
        const other = await secondUser();

        expect((await call(`/lists/${id}`, 'GET', undefined, other)).status).toBe(404);
        expect(
            (await call(`/lists/${id}/items`, 'POST', { igdbId: e.game.id }, other)).status
        ).toBe(404);
        expect((await call(`/lists/${id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect((await call('/lists', 'GET', undefined, other)).lists).toEqual([]);

        const theirs = (await call('/lists', 'POST', { name: 'Theirs' }, other)).list.id;
        // any game can go on your own list, owned or not
        expect(
            (await call(`/lists/${theirs}/items`, 'POST', { igdbId: e.game.id }, other)).status
        ).toBe(200);
        expect((await call(`/lists/${id}/items`, 'POST', { igdbId: 99999 })).status).toBe(404);
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
