import { describe, expect, it } from 'vitest';
import { PROFILE_PREVIEW_SIZE } from '@gamequeue/shared';
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

describe('slot candidates', () => {
    it('lists the queue first, then in progress, then the backlog, and can search and exclude', async () => {
        const { call, ids, names } = await setup(6);
        await call(`/entries/${ids[4]}/start`, 'POST', { date: '2025-01-01', platformId: PC.id });
        await call('/queue/items', 'POST', { entryId: ids[5] });
        await call('/queue/items', 'POST', { entryId: ids[2] });
        const page = await call('/entries/candidates');
        expect(page.total).toBe(6);
        expect(names(page.entries)).toEqual([
            'Game 06', // queue order
            'Game 03',
            'Game 05', // playing
            'Game 01', // backlog by title
            'Game 02',
            'Game 04'
        ]);
        expect(
            names((await call('/entries/candidates?q=game 0&limit=2&offset=1')).entries)
        ).toEqual(['Game 03', 'Game 05']);
        expect(names((await call(`/entries/candidates?exclude=${ids[5]}`)).entries)).not.toContain(
            'Game 06'
        );
    });
});

describe('smart list paging and preview', () => {
    it('pages a saved smart list and previews unsaved rules', async () => {
        const { call, names } = await setup(10);
        const made = await call('/smart-lists', 'POST', {
            name: 'Everything unplayed',
            rules: [{ field: 'status', anyOf: ['unplayed'] }],
            sort: 'title'
        });
        const page = (await call(`/smart-lists/${made.smartList.id}?limit=4&offset=8`)).smartList;
        expect(page.total).toBe(10);
        expect(names(page.entries)).toEqual(['Game 09', 'Game 10']);

        const preview = await call('/smart-lists/preview?limit=3', 'POST', {
            rules: [{ field: 'status', anyOf: ['unplayed'] }],
            sort: 'title',
            dir: 'desc'
        });
        expect(preview.total).toBe(10);
        expect(names(preview.entries)).toEqual(['Game 10', 'Game 09', 'Game 08']);
        expect((await call('/smart-lists/preview', 'POST', { rules: 'x' })).status).toBe(400);
    });
});

describe('paging the public profile', () => {
    it('shows a short preview of each list with its total, then the rest on request', async () => {
        const { app, call, ids } = await setup(30);
        const { list } = await call('/lists', 'POST', { name: 'Big' });
        for (const id of ids) await call(`/lists/${list.id}/items`, 'POST', { entryId: id });
        for (const id of ids.slice(0, 20)) await call('/queue/items', 'POST', { entryId: id });
        const me = (await call('/auth/me')).user.username as string;
        const get = async (path: string) =>
            (await app.request(`/api/profiles/${me}${path}`)).json();

        const { profile } = await get('');
        expect(profile.lists[0].total).toBe(30);
        expect(profile.lists[0].entries).toHaveLength(PROFILE_PREVIEW_SIZE);
        expect(profile.summary.total).toBe(30);

        const more = await get(`/lists/${list.id}?limit=100&offset=${PROFILE_PREVIEW_SIZE}`);
        expect(more.total).toBe(30);
        expect(more.entries).toHaveLength(30 - PROFILE_PREVIEW_SIZE);
        expect(more.entries[0].game.name).toBe('Game 13');

        const queue = (await get('/queue?limit=5&offset=15')).games;
        expect(queue.total).toBe(20);
        expect(queue.entries).toHaveLength(5);
        const collection = (await get('/collection?limit=10')).games;
        expect(collection).toMatchObject({ total: 30 });
        expect(collection.entries).toHaveLength(10);
        // someone else's list id is not reachable through this user's profile
        expect((await app.request(`/api/profiles/${me}/lists/9999`)).status).toBe(404);
    });
});

describe('releasing soon', () => {
    it('lists wishlisted games with an exact release day in the window, soonest first', async () => {
        const { call } = await setupApi([
            fakeGame(1, 'Later', { releaseDate: '2026-10-30', releasePrecision: 'day' }),
            fakeGame(2, 'Sooner', { releaseDate: '2026-10-22', releasePrecision: 'day' }),
            fakeGame(3, 'Too far', { releaseDate: '2026-12-01', releasePrecision: 'day' }),
            fakeGame(4, 'Vague', { releaseDate: '2026-10-31', releasePrecision: 'month' }),
            fakeGame(5, 'Out already', { releaseDate: '2026-10-01', releasePrecision: 'day' })
        ]);
        for (const igdbId of [1, 2, 3, 4, 5]) await call('/wishlist/items', 'POST', { igdbId });
        const soon = await call('/wishlist/releasing-soon?days=14&today=2026-10-21');
        expect(soon.items.map((i: any) => i.game.name)).toEqual(['Sooner', 'Later']);
    });
});
