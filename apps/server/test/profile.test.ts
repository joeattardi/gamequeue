import { describe, expect, it } from 'vitest';
import { lists } from '../src/db/schema.js';
import { cookieFrom, fakeGame, fakeIgdb, json, makeApp, register } from './helpers.js';

async function setup() {
    const { client } = fakeIgdb([fakeGame(1, 'Hades'), fakeGame(2, 'Celeste')]);
    const { app } = makeApp({}, client);
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const post = (path: string, body: unknown) =>
        app.request(`/api${path}`, json(body, { cookie, origin: 'http://localhost' }));
    const put = (path: string, body: unknown) =>
        app.request(`/api${path}`, {
            ...json(body, { cookie, origin: 'http://localhost' }),
            method: 'PUT'
        });
    const add = async (igdbId: number) =>
        (await (await post('/entries', { igdbId, platformIds: [6] })).json()).entry;
    return { app, cookie, post, put, add };
}

describe('public profile', () => {
    it('is readable without logging in and leaks no private data', async () => {
        const { app, post, put, add } = await setup();
        const hades = await add(1);
        const celeste = await add(2);
        expect((await app.request('/api/slots')).status).toBe(401); // the rest of the API stays private

        await put(`/entries/${celeste.id}`, { notes: 'secret note' });
        const list = (await (await post('/lists', { name: 'Favourites' })).json()).list;
        await post(`/lists/${list.id}/items`, { entryId: hades.id });
        await post('/queue/items', { entryId: celeste.id });

        const res = await app.request('/api/profiles/JOE');
        expect(res.status).toBe(200);
        const text = await res.text();
        const { profile } = JSON.parse(text);
        expect(profile.username).toBe('joe');
        expect(profile.summary).toMatchObject({ total: 2, byStatus: { unplayed: 2 } });
        expect(profile.lists).toHaveLength(1);
        expect(
            profile.lists[0].entries.map((e: { game: { name: string } }) => e.game.name)
        ).toEqual(['Hades']);
        expect(profile.slots.map((s: { name: string }) => s.name)).toEqual([
            'Main',
            'Secondary',
            'Palate cleanser'
        ]);
        expect(text).not.toContain('secret note');
        expect(text).not.toContain('me@example.com');
    });

    it('shows the queue in order, publicly, without creating one', async () => {
        const { app, post, put, add } = await setup();
        const hades = await add(1);
        const celeste = await add(2);
        expect((await (await app.request('/api/profiles/joe/queue')).json()).queue.entries).toEqual(
            []
        );
        await post('/queue/items', { entryId: hades.id });
        await post('/queue/items', { entryId: celeste.id });
        // the queue is not among the profile's lists
        expect((await (await app.request('/api/profiles/joe')).json()).profile.lists).toEqual([]);
        await put('/queue/order', { entryIds: [celeste.id, hades.id] });

        const res = await app.request('/api/profiles/JOE/queue');
        expect(res.status).toBe(200);
        const text = await res.text();
        const { queue } = JSON.parse(text);
        expect(queue.username).toBe('joe');
        expect(queue.entries.map((e: { game: { name: string } }) => e.game.name)).toEqual([
            'Celeste',
            'Hades'
        ]);
        expect(text).not.toContain('me@example.com');
    });

    it('does not create a queue when viewing one', async () => {
        const { app, db } = makeApp();
        await register(app, 'me@example.com', undefined, 'joe');
        await app.request('/api/profiles/joe/queue');
        expect(db.select().from(lists).all()).toHaveLength(0);
    });

    it('shows games in slots', async () => {
        const { app, put, add } = await setup();
        const hades = await add(1);
        const slots = (await (await app.request('/api/profiles/joe')).json()).profile.slots;
        expect(slots.every((s: { entry: unknown }) => s.entry === null)).toBe(true);
        // slot ids are 1..3 in a fresh database
        expect((await put('/slots/1/entry', { entryId: hades.id })).status).toBe(200);
        const after = (await (await app.request('/api/profiles/joe')).json()).profile;
        expect(after.slots[0].entry).toMatchObject({ status: 'playing', game: { name: 'Hades' } });
    });

    it('does not create a queue for the viewed user', async () => {
        const { app, db } = makeApp();
        await register(app, 'me@example.com', undefined, 'joe');
        await app.request('/api/profiles/joe');
        expect(db.select().from(lists).all()).toHaveLength(0);
    });

    it('returns 404 for unknown or malformed usernames', async () => {
        const { app } = makeApp();
        expect((await app.request('/api/profiles/nobody')).status).toBe(404);
        expect((await app.request('/api/profiles/a')).status).toBe(404);
        expect((await app.request('/api/profiles/nobody/queue')).status).toBe(404);
    });
});
