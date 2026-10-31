import { describe, expect, it } from 'vitest';
import { fakeGame } from './helpers.js';
import { PC, setupApi } from './api.js';

/** Thirty games named "Game 01" … "Game 30", so title order is id order. */
const CATALOG = Array.from({ length: 30 }, (_, i) =>
    fakeGame(i + 1, `Game ${String(i + 1).padStart(2, '0')}`)
);

async function setup(owned = 30) {
    const s = await setupApi(CATALOG);
    const ids: number[] = [];
    for (let i = 1; i <= owned; i++) ids.push((await s.add(i)).id);
    const names = (rows: any[]) => rows.map((r) => r.game.name);
    return { ...s, ids, names };
}

describe('paging the collection', () => {
    it('returns a page and the total, and walks the whole set without gaps', async () => {
        const { call, names } = await setup();
        const first = await call('/entries?limit=12');
        expect(first.total).toBe(30);
        expect(first.entries).toHaveLength(12);
        const all = [...first.entries];
        for (let offset = 12; offset < 30; offset += 12)
            all.push(...(await call(`/entries?limit=12&offset=${offset}`)).entries);
        expect(names(all)).toEqual(CATALOG.map((g) => g.name));
    });

    it('has a default page size, counts matches rather than the page, and rejects bad paging', async () => {
        const { call } = await setup();
        expect((await call('/entries')).entries).toHaveLength(30);
        expect((await call('/entries?q=Game 1&limit=3')).total).toBe(10);
        expect((await call('/entries?limit=0')).status).toBe(400);
        expect((await call('/entries?limit=100000')).status).toBe(400);
        expect((await call('/entries?offset=-1')).status).toBe(400);
    });

    it('pages past the end as an empty page', async () => {
        const { call } = await setup(5);
        const page = await call('/entries?limit=10&offset=50');
        expect(page.entries).toEqual([]);
        expect(page.total).toBe(5);
    });
});

describe('paging an ordered list and the queue', () => {
    it('pages in list order and keeps the full total', async () => {
        const { call, ids, names } = await setup();
        const { list } = await call('/lists', 'POST', { name: 'Mine' });
        for (const id of [...ids].reverse())
            await call(`/lists/${list.id}/items`, 'POST', { entryId: id });
        const page = (await call(`/lists/${list.id}?limit=5&offset=10`)).list;
        expect(page.total).toBe(30);
        expect(names(page.entries)).toEqual([
            'Game 20',
            'Game 19',
            'Game 18',
            'Game 17',
            'Game 16'
        ]);
    });

    it('moves a game to an absolute position without the rest of the list', async () => {
        const { call, ids, names } = await setup(8);
        for (const id of ids) await call('/queue/items', 'POST', { entryId: id });
        const order = async () => names((await call('/queue?limit=100')).list.entries);

        await call('/queue/move', 'PUT', { entryId: ids[6], toIndex: 1 });
        expect((await order()).slice(0, 4)).toEqual(['Game 01', 'Game 07', 'Game 02', 'Game 03']);
        await call('/queue/move', 'PUT', { entryId: ids[0], toIndex: 999 });
        expect((await order()).at(-1)).toBe('Game 01');
        expect(await order()).toHaveLength(8);
        // positions stay contiguous, so a later append lands at the end
        expect((await call('/queue/move', 'PUT', { entryId: 9999, toIndex: 0 })).status).toBe(404);
    });

    it('moves a game inside a user list', async () => {
        const { call, ids, names } = await setup(4);
        const { list } = await call('/lists', 'POST', { name: 'Mine' });
        for (const id of ids) await call(`/lists/${list.id}/items`, 'POST', { entryId: id });
        await call(`/lists/${list.id}/move`, 'PUT', { entryId: ids[3], toIndex: 0 });
        expect(names((await call(`/lists/${list.id}`)).list.entries)).toEqual([
            'Game 04',
            'Game 01',
            'Game 02',
            'Game 03'
        ]);
    });
});

describe('paging the wishlist', () => {
    it('pages, moves and finds what releases soon', async () => {
        const { call, names } = await setup(0);
        for (let i = 1; i <= 6; i++) await call('/wishlist/items', 'POST', { igdbId: i });
        const page = (await call('/wishlist?limit=2&offset=2')).wishlist;
        expect(page.total).toBe(6);
        expect(names(page.items)).toEqual(['Game 03', 'Game 04']);

        await call('/wishlist/move', 'PUT', { igdbId: 6, toIndex: 0 });
        expect(names((await call('/wishlist?limit=2')).wishlist.items)).toEqual([
            'Game 06',
            'Game 01'
        ]);

        // nothing in the fake catalog has a release day in the window
        expect((await call('/wishlist/releasing-soon?today=2026-01-01')).items).toEqual([]);
        expect((await call('/wishlist/releasing-soon?today=nope')).status).toBe(400);
    });
});
