import { describe, expect, it } from 'vitest';
import type { ExportFile } from '@gamequeue/shared';
import { wishlists } from '../src/db/schema.js';
import { PC, PS5, setupApi } from './api.js';

async function setup() {
    const s = await setupApi();
    const names = (w: Record<string, any>) => w.items.map((i: any) => i.game.name);
    const wishlist = async () => (await s.call('/wishlist')).wishlist;
    const wish = (igdbId: number, extra: Record<string, unknown> = {}) =>
        s.call('/wishlist/items', 'POST', { igdbId, ...extra });
    return { ...s, names, wishlist, wish };
}

describe('wishlist', () => {
    it('exists from the start, empty, and is not one of your lists', async () => {
        const { call, wishlist } = await setup();
        expect(await wishlist()).toMatchObject({ name: 'Wishlist', items: [] });
        expect((await call('/lists')).lists).toEqual([]);
        expect((await wishlist()).id).toBe((await call('/wishlist')).wishlist.id);
    });

    it('holds games you do not own, in order, ignoring duplicates', async () => {
        const { wish, wishlist, names, call } = await setup();
        for (const id of [3, 1, 2]) expect((await wish(id)).status).toBe(200);
        expect((await wish(1)).wishlist.items).toHaveLength(3);
        expect(names(await wishlist())).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        // not in the collection or the backlog
        expect((await call('/entries')).entries).toEqual([]);
        expect((await call('/entries?view=backlog')).entries).toEqual([]);
        expect((await wishlist()).items[0].game).toMatchObject({
            id: 3,
            genres: ['Role-playing (RPG)']
        });
    });

    it('refuses games you own, pointing at the entry', async () => {
        const { add, wish } = await setup();
        const e = await add(1);
        const res = await wish(1);
        expect(res.status).toBe(409);
        expect(res.entryId).toBe(e.id);
    });

    it('stores a target platform and a note, and edits them', async () => {
        const { wish, call, wishlist } = await setup();
        await wish(1, { platformId: PS5.id, note: 'wait for a sale' });
        expect((await wishlist()).items[0]).toMatchObject({
            igdbId: 1,
            platform: { id: PS5.id },
            note: 'wait for a sale'
        });
        const patched = await call('/wishlist/items/1', 'PATCH', { platformId: null, note: '' });
        expect(patched.wishlist.items[0]).toMatchObject({ platform: null, note: '' });
        expect((await call('/wishlist/items/1', 'PATCH', { platformId: 999_999 })).status).toBe(
            400
        );
        expect((await call('/wishlist/items/1', 'PATCH', {})).status).toBe(400);
        expect((await call('/wishlist/items/2', 'PATCH', { note: 'x' })).status).toBe(404);
        expect((await wish(2, { platformId: 999_999 })).status).toBe(400);
    });

    it('reorders and removes, closing the gap', async () => {
        const { wish, call, names, wishlist } = await setup();
        for (const id of [1, 2, 3]) await wish(id);
        const res = await call('/wishlist/order', 'PUT', { igdbIds: [3, 1, 2] });
        expect(names(res.wishlist)).toEqual(['Hollow Knight', 'Hades', 'Celeste']);
        expect((await call('/wishlist/order', 'PUT', { igdbIds: [1] })).status).toBe(400);

        const removed = await call('/wishlist/items/1', 'DELETE');
        expect(names(removed.wishlist)).toEqual(['Hollow Knight', 'Celeste']);
        await wish(4);
        expect(names(await wishlist())).toEqual(['Hollow Knight', 'Celeste', 'Outer Wilds']);
    });

    it('is dropped when the game joins the collection', async () => {
        const { wish, add, wishlist, call, names } = await setup();
        await wish(1);
        await wish(2);
        const search = (await call('/igdb/search?q=hades')).results[0];
        expect(search).toMatchObject({ igdbId: 1, wishlisted: true, entryId: null });

        const e = await add(1);
        expect(e.game.name).toBe('Hades');
        expect(names(await wishlist())).toEqual(['Celeste']);
        expect((await call('/igdb/search?q=hades')).results[0]).toMatchObject({
            wishlisted: false,
            entryId: e.id
        });
    });

    it('is private to you', async () => {
        const { wish, call, secondUser } = await setup();
        await wish(1, { note: 'mine' });
        const other = await secondUser();
        expect((await call('/wishlist', 'GET', undefined, other)).wishlist.items).toEqual([]);
        // the same game can be on both users' wishlists
        expect((await call('/wishlist/items', 'POST', { igdbId: 1 }, other)).status).toBe(200);
        expect((await call('/wishlist/items/1', 'DELETE', undefined, other)).status).toBe(200);
        expect((await call('/wishlist')).wishlist.items).toHaveLength(1);
    });
});

describe('wishlist on the public profile', () => {
    it('is public without notes, counted, and never created by reading', async () => {
        const { app, db, wish } = await setup();
        const empty = await (await app.request('/api/profiles/user_me/wishlist')).json();
        expect(empty.wishlist).toEqual({ username: 'user_me', items: [], total: 0 });
        expect(db.select().from(wishlists).all()).toEqual([]);

        await wish(2, { platformId: PC.id, note: 'secret' });
        await wish(1);
        const res = await app.request('/api/profiles/user_me/wishlist');
        const text = await res.text();
        expect(JSON.parse(text).wishlist.items.map((i: any) => i.game.name)).toEqual([
            'Celeste',
            'Hades'
        ]);
        expect(text).not.toContain('secret');
        const profile = (await (await app.request('/api/profiles/user_me')).json()).profile;
        expect(profile.summary.wishlisted).toBe(2);
        expect((await app.request('/api/profiles/nobody/wishlist')).status).toBe(404);
        // "wishlist" is not mistaken for a collection view
        expect((await app.request('/api/profiles/user_me/queue')).status).toBe(200);
    });
});

describe('wishlist export and import', () => {
    const exportOf = async (s: Awaited<ReturnType<typeof setup>>) =>
        (await s.call('/data/export')) as unknown as ExportFile & { status: number };

    it('round-trips, and importing twice changes nothing', async () => {
        const a = await setup();
        await a.add(3);
        await a.wish(2, { platformId: PC.id, note: 'sale' });
        await a.wish(1);
        const file = await exportOf(a);
        expect(file.wishlist.map((w) => w.igdbId)).toEqual([2, 1]);
        expect(file.wishlist[0]).toMatchObject({
            platform: { id: PC.id },
            note: 'sale',
            game: { name: 'Celeste' }
        });
        expect(file.wishlist[0]!.game.platforms.length).toBeGreaterThan(0);

        const b = await setup();
        const preview = await b.call('/data/import', 'POST', file);
        expect(preview.report.wishlist).toEqual({ added: 2 });
        expect((await b.wishlist()).items).toEqual([]);

        const done = await b.call('/data/import?commit=true', 'POST', file);
        expect(done.report.wishlist).toEqual({ added: 2 });
        expect(b.names(await b.wishlist())).toEqual(['Celeste', 'Hades']);
        expect((await b.wishlist()).items[0]).toMatchObject({
            note: 'sale',
            platform: { id: PC.id }
        });

        const again = await b.call('/data/import?commit=true', 'POST', file);
        expect(again.report.wishlist).toEqual({ added: 0 });
        expect(b.names(await b.wishlist())).toEqual(['Celeste', 'Hades']);
    });

    it('keeps your wishlist, fills gaps, and skips games you own', async () => {
        const a = await setup();
        await a.wish(1, { platformId: PS5.id, note: 'from file' });
        await a.wish(2);
        const file = await exportOf(a);

        const b = await setup();
        await b.add(2);
        await b.wish(1, { note: 'mine' });
        await b.wish(4);
        const res = await b.call('/data/import?commit=true', 'POST', file);
        expect(res.report.wishlist).toEqual({ added: 0 });
        expect(res.report.notes.some((n: string) => n.includes('Celeste'))).toBe(true);
        const items = (await b.wishlist()).items;
        expect(items.map((i: any) => i.game.name)).toEqual(['Hades', 'Outer Wilds']);
        // your note wins; the empty platform is filled
        expect(items[0]).toMatchObject({ note: 'mine', platform: { id: PS5.id } });
    });

    it('takes a game off the wishlist when an import adds it to the collection', async () => {
        const a = await setup();
        await a.add(1);
        const file = await exportOf(a);
        const b = await setup();
        await b.wish(1);
        await b.call('/data/import?commit=true', 'POST', file);
        expect((await b.wishlist()).items).toEqual([]);
    });

    it('still accepts older files with no wishlist', async () => {
        const a = await setup();
        await a.add(1);
        const { wishlist: _dropped, ...old } = await exportOf(a);
        const b = await setup();
        const res = await b.call('/data/import?commit=true', 'POST', old);
        expect(res.status).toBe(200);
        expect(res.report.wishlist).toEqual({ added: 0 });
    });
});
