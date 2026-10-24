import { describe, expect, it } from 'vitest';
import { PC, cookieFrom, fakeGame, fakeIgdb, makeApp, register } from './helpers.js';

async function setup() {
    const catalog = [
        fakeGame(1, 'Source'),
        fakeGame(2, 'Good', { igdbRating: 90 }),
        fakeGame(3, 'Okay', { igdbRating: 70 }),
        fakeGame(4, 'Unrated', { igdbRating: null }),
        fakeGame(5, 'Lonely')
    ];
    const { client, calls } = fakeIgdb(catalog, { 1: [4, 3, 2, 1] });
    const { app } = makeApp({}, client);
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
    return { app, calls, call };
}

describe('similar games', () => {
    it('lists IGDB’s similar games best rated first, unrated last, never the game itself', async () => {
        const { call } = await setup();
        const { games } = await call('/igdb/games/1/similar');
        expect(games.map((g: { name: string }) => g.name)).toEqual(['Good', 'Okay', 'Unrated']);
        expect(games[0]).toMatchObject({ igdbId: 2, entryId: null, wishlisted: false });
    });

    it('marks games the user owns or wishlisted, without caching that', async () => {
        const { calls, call } = await setup();
        const { entry } = await call('/entries', 'POST', { igdbId: 2, platformIds: [PC.id] });
        await call('/wishlist/items', 'POST', { igdbId: 3 });
        const { games } = await call('/igdb/games/1/similar');
        expect(games.find((g: { igdbId: number }) => g.igdbId === 2).entryId).toBe(entry.id);
        expect(games.find((g: { igdbId: number }) => g.igdbId === 3).wishlisted).toBe(true);
        expect(games.find((g: { igdbId: number }) => g.igdbId === 4).wishlisted).toBe(false);
        expect(calls.fetchSimilarGames).toBe(1);
    });

    it('asks IGDB once per game, and returns an empty list for a game with none', async () => {
        const { calls, call } = await setup();
        await call('/igdb/games/1/similar');
        await call('/igdb/games/1/similar');
        expect(calls.fetchSimilarGames).toBe(1);
        expect((await call('/igdb/games/5/similar')).games).toEqual([]);
    });

    it('needs a login and a valid id', async () => {
        const { app, call } = await setup();
        expect((await app.request('/api/igdb/games/1/similar')).status).toBe(401);
        expect((await call('/igdb/games/abc/similar')).status).toBe(404);
    });
});
