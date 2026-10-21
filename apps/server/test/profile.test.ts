import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { lists, playthroughs } from '../src/db/schema.js';
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
        // lists are tiles only; the games are on the list's own endpoint
        expect(profile.lists).toEqual([
            { id: list.id, name: 'Favourites', total: 1, covers: [hades.game.coverImageId] }
        ]);
        expect(profile.lists[0].entries).toBeUndefined();
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
        expect((await (await app.request('/api/profiles/joe/queue')).json()).games.entries).toEqual(
            []
        );
        await post('/queue/items', { entryId: hades.id });
        await post('/queue/items', { entryId: celeste.id });
        // the queue is counted in the summary but is not among the profile's lists
        expect((await (await app.request('/api/profiles/joe')).json()).profile.summary.queued).toBe(
            2
        );
        expect((await (await app.request('/api/profiles/joe')).json()).profile.lists).toEqual([]);
        await put('/queue/order', { entryIds: [celeste.id, hades.id] });

        const res = await app.request('/api/profiles/JOE/queue');
        expect(res.status).toBe(200);
        const text = await res.text();
        const { games: queue } = JSON.parse(text);
        expect(queue.username).toBe('joe');
        expect(queue.entries.map((e: { game: { name: string } }) => e.game.name)).toEqual([
            'Celeste',
            'Hades'
        ]);
        expect(text).not.toContain('me@example.com');
    });

    it('lists games per status, backlog and collection', async () => {
        const { app, put, add } = await setup();
        const hades = await add(1);
        await add(2);
        await put('/slots/1/entry', { entryId: hades.id });
        const names = async (view: string) =>
            (await (await app.request(`/api/profiles/joe/${view}`)).json()).games.entries.map(
                (e: { game: { name: string } }) => e.game.name
            );
        expect(await names('collection')).toEqual(['Celeste', 'Hades']);
        expect(await names('playing')).toEqual(['Hades']);
        expect(await names('backlog')).toEqual(['Celeste']);
        expect(await names('finished')).toEqual([]);
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
        expect((await app.request('/api/profiles/joe/nonsense')).status).toBe(404);
    });

    describe('finished by year', () => {
        async function finishedSetup() {
            const { client } = fakeIgdb([
                fakeGame(1, 'Hades'),
                fakeGame(2, 'Celeste'),
                fakeGame(3, 'Hollow Knight')
            ]);
            const { app, db } = makeApp({}, client);
            const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
            const call = (path: string, body: unknown) =>
                app.request(`/api${path}`, json(body, { cookie, origin: 'http://localhost' }));
            const finish = async (igdbId: number, started: string, ended: string) => {
                const e = (await (await call('/entries', { igdbId, platformIds: [6] })).json())
                    .entry;
                await call(`/entries/${e.id}/start`, { date: started });
                await call(`/entries/${e.id}/finish`, { date: ended });
                return e;
            };
            const get = async (path: string) => app.request(`/api/profiles/joe/${path}`);
            const names = async (path: string) =>
                (await (await get(path)).json()).games.entries.map(
                    (e: { game: { name: string } }) => e.game.name
                );
            return { app, db, call, finish, get, names };
        }

        it('lists years with counts and the all-time page newest first', async () => {
            const { finish, get, names } = await finishedSetup();
            await finish(1, '2025-01-01', '2025-02-01');
            await finish(2, '2026-01-01', '2026-03-01');
            await finish(3, '2026-01-15', '2026-02-01');
            expect(await names('finished')).toEqual(['Celeste', 'Hollow Knight', 'Hades']);
            expect((await (await get('finished')).json()).games.years).toEqual([
                { year: '2026', count: 2 },
                { year: '2025', count: 1 }
            ]);
        });

        it('shows a year oldest finish first, and the game once per year', async () => {
            const { call, finish, get, names } = await finishedSetup();
            const hades = await finish(1, '2026-01-01', '2026-05-01');
            await finish(2, '2026-01-01', '2026-03-01');
            await finish(3, '2025-01-01', '2025-02-01');
            // a replay in the same year, finished earlier than the other 2026 games
            await call(`/entries/${hades.id}/start`, { date: '2026-01-02' });
            await call(`/entries/${hades.id}/finish`, { date: '2026-06-01' });
            expect(await names('finished/2026')).toEqual(['Celeste', 'Hades']);
            expect(await names('finished/2025')).toEqual(['Hollow Knight']);
            expect(await names('finished/2024')).toEqual([]);
            const body = (await (await get('finished/2026')).json()).games;
            expect(body.year).toBe('2026');
            expect(body.years).toHaveLength(2);
        });

        it('keeps a game on an old year page after it is restarted', async () => {
            const { call, finish, names } = await finishedSetup();
            const hades = await finish(1, '2023-01-01', '2023-02-01');
            await call(`/entries/${hades.id}/start`, { date: '2026-01-01' });
            expect(await names('finished')).toEqual([]);
            expect(await names('finished/2023')).toEqual(['Hades']);
        });

        it('puts finishes without a date under "unknown", last in the years', async () => {
            const { db, finish, get, names } = await finishedSetup();
            await finish(1, '2025-01-01', '2025-02-01');
            await finish(2, '2025-01-01', '2025-03-01');
            db.update(playthroughs).set({ endedOn: null }).where(eq(playthroughs.id, 2)).run();
            expect((await (await get('finished')).json()).games.years).toEqual([
                { year: '2025', count: 1 },
                { year: 'unknown', count: 1 }
            ]);
            expect(await names('finished/unknown')).toEqual(['Celeste']);
            expect(await names('finished')).toEqual(['Hades', 'Celeste']);
        });

        it('rejects a malformed year and years on other views', async () => {
            const { get } = await finishedSetup();
            expect((await get('finished/abc')).status).toBe(404);
            expect((await get('finished/26')).status).toBe(404);
            expect((await get('backlog/2026')).status).toBe(404);
            expect((await get('finished/2026')).status).toBe(200);
        });
    });
});
