import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { games } from '../src/db/schema.js';
import { PC, cookieFrom, fakeGame, fakeIgdb, makeApp, register } from './helpers.js';

async function setup() {
    const catalog = [fakeGame(1, 'Shots', { screenshots: ['aaa', 'bbb'] }), fakeGame(2, 'None')];
    const { client, calls } = fakeIgdb(catalog);
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
    return { calls, db, call };
}

describe('screenshots', () => {
    it('are stored with a new game and come with it, without asking IGDB again', async () => {
        const { calls, call } = await setup();
        const { entry } = await call('/entries', 'POST', { igdbId: 1, platformIds: [PC.id] });
        expect(entry.game.screenshots).toEqual(['aaa', 'bbb']);
        expect((await call(`/entries/${entry.id}`)).entry.game.screenshots).toEqual(['aaa', 'bbb']);
        expect((await call('/igdb/games/1')).game.screenshots).toEqual(['aaa', 'bbb']);
        expect(calls.fetchScreenshots).toBe(0);
    });

    it('are fetched once when a game cached without them is opened', async () => {
        const { calls, db, call } = await setup();
        const { entry } = await call('/entries', 'POST', { igdbId: 1, platformIds: [PC.id] });
        db.update(games).set({ screenshots: null }).where(eq(games.id, 1)).run();
        expect((await call(`/entries/${entry.id}`)).entry.game.screenshots).toEqual(['aaa', 'bbb']);
        await call(`/entries/${entry.id}`);
        expect(calls.fetchScreenshots).toBe(1);
    });

    it('count as checked when a game has none', async () => {
        const { calls, db, call } = await setup();
        await call('/igdb/games/2');
        db.update(games).set({ screenshots: null }).where(eq(games.id, 2)).run();
        expect((await call('/igdb/games/2')).game.screenshots).toEqual([]);
        await call('/igdb/games/2');
        expect(calls.fetchScreenshots).toBe(1);
    });
});
