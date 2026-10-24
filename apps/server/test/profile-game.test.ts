import { describe, expect, it } from 'vitest';
import { fakeGame, fakeIgdb, makeApp, register } from './helpers.js';
import { setupApi } from './api.js';

describe('public game page', () => {
    it('shows cached game data plus what the user has, with no login and no notes', async () => {
        const { app, add, call } = await setupApi();
        const hades = await add(1);
        await call(`/entries/${hades.id}`, 'PATCH', { rating: 4, notes: 'secret' });
        await call('/wishlist/items', 'POST', { igdbId: 2 });
        const get = async (id: number) => app.request(`/api/profiles/user_me/games/${id}`);

        const owned = await (await get(1)).json();
        expect(owned.game).toMatchObject({ id: 1, name: 'Hades' });
        expect(owned.entry).toMatchObject({ status: 'unplayed', rating: 4 });
        expect(owned.entry.notes).toBeUndefined();
        expect(owned.wishlisted).toBe(false);

        expect(await (await get(2)).json()).toMatchObject({ entry: null, wishlisted: true });
    });

    it('404s for unknown users and bad ids, and never calls IGDB for an uncached game', async () => {
        const igdb = fakeIgdb([fakeGame(9, 'Never Cached')]);
        const { app } = makeApp({}, igdb.client);
        await register(app);
        expect((await app.request('/api/profiles/user_me/games/9')).status).toBe(404);
        expect((await app.request('/api/profiles/user_me/games/abc')).status).toBe(404);
        expect((await app.request('/api/profiles/nobody/games/9')).status).toBe(404);
        expect(Object.values(igdb.calls).reduce((a: number, b: any) => a + Number(b), 0)).toBe(0);
    });
});
