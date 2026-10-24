import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dismissedGames, users } from '../src/db/schema.js';
import { PC, cookieFrom, fakeGame, fakeIgdb, makeApp, register } from './helpers.js';

// Loved games 1 and 2. Both are similar to 10; 11 only to 1; 12 only to 2; 13 is owned, 14 wishlisted.
async function setup() {
    const catalog = [
        fakeGame(1, 'Hades'),
        fakeGame(2, 'Celeste'),
        fakeGame(3, 'Meh'),
        fakeGame(10, 'Both', { igdbRating: 70 }),
        fakeGame(11, 'First only', { igdbRating: 95 }),
        fakeGame(12, 'Second only', { igdbRating: 60 }),
        fakeGame(13, 'Owned'),
        fakeGame(14, 'Wished')
    ];
    const { client, calls } = fakeIgdb(catalog, {
        1: [10, 11, 13, 14],
        2: [10, 12],
        3: [12]
    });
    const { app, db } = makeApp({}, client);
    const cookie = cookieFrom(await register(app));
    const call = async (path: string, method = 'GET', body?: unknown) => {
        const res = await app.request(`/api${path}`, {
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            headers: {
                origin: 'http://localhost',
                cookie,
                ...(body === undefined ? {} : { 'content-type': 'application/json' })
            }
        });
        return { status: res.status, ...(await res.json()) } as Record<string, any>;
    };
    const add = async (igdbId: number) =>
        (await call('/entries', 'POST', { igdbId, platformIds: [PC.id] })).entry.id as number;
    return { app, db, calls, call, add };
}

describe('discover', () => {
    it('is empty until a game is favorited or rated 4+', async () => {
        const { call, add } = await setup();
        const meh = await add(3);
        await call(`/entries/${meh}`, 'PATCH', { rating: 3 });
        expect(await call('/discover')).toMatchObject({ seedCount: 0, picks: [], rows: [] });
    });

    it('ranks by how many loved games a suggestion is similar to, then by rating', async () => {
        const { call, add } = await setup();
        const hades = await add(1);
        const celeste = await add(2);
        await add(13);
        await call(`/entries/${hades}`, 'PATCH', { favorite: true });
        await call(`/entries/${celeste}`, 'PATCH', { rating: 4 });
        await call('/wishlist/items', 'POST', { igdbId: 14 });
        const d = await call('/discover');
        expect(d.seedCount).toBe(2);
        // Owned (13) and wishlisted (14) games are hidden
        expect(d.picks.map((p: any) => p.name)).toEqual(['Both', 'First only', 'Second only']);
        expect(d.picks[0]).toMatchObject({ seedMatches: 2, becauseOf: ['Hades', 'Celeste'] });
        expect(d.picks[1]).toMatchObject({ seedMatches: 1, becauseOf: ['Hades'] });
        expect(d.rows.map((r: any) => r.seed.name)).toEqual(['Hades', 'Celeste']);
        expect(d.rows[0].games.map((g: any) => g.name)).toEqual(['First only', 'Both']);
    });

    it('does not draw from games that are neither favorites nor 4+ stars', async () => {
        const { call, add } = await setup();
        const hades = await add(1);
        const meh = await add(3);
        await call(`/entries/${hades}`, 'PATCH', { favorite: true });
        await call(`/entries/${meh}`, 'PATCH', { rating: 3 });
        const d = await call('/discover');
        expect(d.seedCount).toBe(1);
        expect(d.picks.map((p: any) => p.name)).not.toContain('Second only');
    });

    it('stops suggesting dismissed games until restored, and dismissing twice is fine', async () => {
        const { call, add } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades}`, 'PATCH', { favorite: true });
        expect((await call('/discover/dismissed/11', 'PUT')).status).toBe(200);
        expect((await call('/discover/dismissed/11', 'PUT')).status).toBe(200);
        const hidden = await call('/discover');
        expect(hidden.picks.map((p: any) => p.igdbId)).not.toContain(11);
        expect(hidden.picks.map((p: any) => p.igdbId)).toContain(10);
        await call('/discover/dismissed/11', 'DELETE');
        expect((await call('/discover')).picks.map((p: any) => p.igdbId)).toContain(11);
    });

    it('keeps dismissals per user and removes them with the account', async () => {
        const { app, db, call } = await setup();
        await call('/discover/dismissed/11', 'PUT');
        const other = cookieFrom(await register(app, 'other@example.com'));
        const res = await app.request('/api/discover/dismissed/11', {
            method: 'DELETE',
            headers: { origin: 'http://localhost', cookie: other }
        });
        expect(res.status).toBe(200); // someone else's DELETE can't touch ours
        expect(db.select().from(dismissedGames).all()).toHaveLength(1);
        db.delete(users).where(eq(users.id, 1)).run();
        expect(db.select().from(dismissedGames).all()).toHaveLength(0);
    });

    it('shares IGDB lookups with the game page and asks once per loved game', async () => {
        const { calls, call, add } = await setup();
        const hades = await add(1);
        await call(`/entries/${hades}`, 'PATCH', { favorite: true });
        await call('/igdb/games/1/similar');
        await call('/discover');
        await call('/discover');
        expect(calls.fetchSimilarGames).toBe(1);
    });

    it('needs a login and a valid id', async () => {
        const { app, call } = await setup();
        expect((await app.request('/api/discover')).status).toBe(401);
        expect((await call('/discover/dismissed/abc', 'PUT')).status).toBe(404);
    });
});
