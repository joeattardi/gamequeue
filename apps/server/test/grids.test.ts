import { describe, expect, it } from 'vitest';
import { GRID_LABEL_PROMPTS } from '@gamequeue/shared';
import { fakeIgdb, makeApp, cookieFrom, register } from './helpers.js';
import { CATALOG, setupApi } from './api.js';
import { purgeUnusedGames } from '../src/services/maintenance.js';
import { games } from '../src/db/schema.js';

async function setup() {
    const s = await setupApi();
    const make = async (extra: Record<string, unknown> = {}) =>
        (await s.call('/grids', 'POST', { title: 'My grid', ...extra })).grid;
    const cell = (id: number, position: number, body: Record<string, unknown>) =>
        s.call(`/grids/${id}/cells/${position}`, 'PUT', body);
    return { ...s, make, cell };
}

describe('grids', () => {
    it('creates a 3x3 grid of empty cells by default', async () => {
        const { make, call } = await setup();
        const g = await make();
        expect(g).toMatchObject({ title: 'My grid', cols: 3, rows: 3 });
        expect(g.cells).toHaveLength(9);
        expect(g.cells.every((c: any) => c.label === '' && c.game === null)).toBe(true);
        expect((await call('/grids')).grids).toMatchObject([
            { id: g.id, title: 'My grid', filled: 0, covers: [] }
        ]);
    });

    it('can start with suggested labels, one per cell', async () => {
        const { make } = await setup();
        const g = await make({ cols: 2, rows: 2, prompts: true });
        expect(g.cells.map((c: any) => c.label)).toEqual(GRID_LABEL_PROMPTS.slice(0, 4));
    });

    it('validates sizes and titles', async () => {
        const { call } = await setup();
        expect((await call('/grids', 'POST', { title: '' })).status).toBe(400);
        expect((await call('/grids', 'POST', { title: 'x', cols: 6 })).status).toBe(400);
        expect((await call('/grids', 'POST', { title: 'x', rows: 0 })).status).toBe(400);
    });

    it('places a game, caching it from IGDB once, and keeps the label', async () => {
        const igdb = fakeIgdb(CATALOG);
        const { app } = makeApp({}, igdb.client);
        const cookie = cookieFrom(await register(app));
        const call = async (path: string, method = 'GET', body?: unknown) => {
            const res = await app.request(`/api${path}`, {
                method,
                headers: {
                    origin: 'http://localhost',
                    cookie,
                    ...(body ? { 'content-type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
            return { status: res.status, ...(await res.json()) } as Record<string, any>;
        };
        const g = (await call('/grids', 'POST', { title: 'G' })).grid;
        const placed = await call(`/grids/${g.id}/cells/4`, 'PUT', {
            label: 'Best soundtrack',
            igdbId: 1
        });
        expect(placed.grid.cells[4]).toMatchObject({
            label: 'Best soundtrack',
            game: { id: 1, name: 'Hades' }
        });
        const again = await call(`/grids/${g.id}/cells/5`, 'PUT', { igdbId: 1 });
        expect(again.grid.cells[5].game.name).toBe('Hades');
        expect(igdb.calls.fetchGame).toBe(1);
        // reading never calls IGDB
        await call(`/grids/${g.id}`);
        expect(igdb.calls.fetchGame).toBe(1);
        // label only change keeps the game
        const relabel = await call(`/grids/${g.id}/cells/4`, 'PUT', { label: 'Best music' });
        expect(relabel.grid.cells[4]).toMatchObject({ label: 'Best music', game: { id: 1 } });
    });

    it('rejects unknown games, bad cells and empty updates', async () => {
        const { make, cell } = await setup();
        const g = await make();
        expect((await cell(g.id, 0, { igdbId: 999 })).status).toBe(404);
        expect((await cell(g.id, 9, { label: 'x' })).status).toBe(404);
        expect((await cell(g.id, -1, { label: 'x' })).status).toBe(404);
        expect((await cell(g.id, 0, {})).status).toBe(400);
        expect((await cell(g.id, 0, { label: 'x'.repeat(61) })).status).toBe(400);
    });

    it('empties a cell by clearing its game and label', async () => {
        const { make, cell } = await setup();
        const g = await make();
        await cell(g.id, 0, { label: 'A', igdbId: 2 });
        const half = await cell(g.id, 0, { igdbId: null });
        expect(half.grid.cells[0]).toMatchObject({ label: 'A', game: null });
        const none = await cell(g.id, 0, { label: '' });
        expect(none.grid.cells[0]).toMatchObject({ label: '', game: null });
    });

    it('allows the same game in several cells', async () => {
        const { make, cell, call } = await setup();
        const g = await make();
        await cell(g.id, 0, { igdbId: 1 });
        await cell(g.id, 1, { igdbId: 1 });
        const grid = (await call(`/grids/${g.id}`)).grid;
        expect(grid.cells.filter((c: any) => c.game?.id === 1)).toHaveLength(2);
        expect((await call('/grids')).grids[0]).toMatchObject({
            filled: 2,
            covers: ['co1', 'co1']
        });
    });

    it('resizes keeping cells at their row and column, dropping those cut off', async () => {
        const { make, cell, call } = await setup();
        const g = await make();
        await cell(g.id, 0, { label: 'top-left' });
        await cell(g.id, 4, { label: 'middle' });
        await cell(g.id, 8, { label: 'bottom-right' });
        const wide = (await call(`/grids/${g.id}`, 'PATCH', { cols: 4 })).grid;
        expect(wide.cells).toHaveLength(12);
        expect(wide.cells[0].label).toBe('top-left');
        expect(wide.cells[5].label).toBe('middle');
        expect(wide.cells[10].label).toBe('bottom-right');
        const small = (await call(`/grids/${g.id}`, 'PATCH', { cols: 2, rows: 2 })).grid;
        expect(small.cells.map((c: any) => c.label)).toEqual(['top-left', '', '', 'middle']);
    });

    it('edits title and description, swaps cells and deletes', async () => {
        const { make, cell, call } = await setup();
        const g = await make();
        const renamed = (
            await call(`/grids/${g.id}`, 'PATCH', { title: 'New', description: 'About' })
        ).grid;
        expect(renamed).toMatchObject({ title: 'New', description: 'About', cols: 3 });
        expect((await call(`/grids/${g.id}`, 'PATCH', {})).status).toBe(400);

        await cell(g.id, 0, { label: 'A', igdbId: 1 });
        await cell(g.id, 1, { label: 'B' });
        const swapped = (await call(`/grids/${g.id}/swap`, 'PUT', { a: 0, b: 1 })).grid;
        expect(swapped.cells[0]).toMatchObject({ label: 'B', game: null });
        expect(swapped.cells[1]).toMatchObject({ label: 'A', game: { id: 1 } });
        const toEmpty = (await call(`/grids/${g.id}/swap`, 'PUT', { a: 1, b: 8 })).grid;
        expect(toEmpty.cells[8]).toMatchObject({ label: 'A' });
        expect(toEmpty.cells[1]).toMatchObject({ label: '' });
        expect((await call(`/grids/${g.id}/swap`, 'PUT', { a: 1, b: 9 })).status).toBe(404);

        expect((await call(`/grids/${g.id}`, 'DELETE')).status).toBe(200);
        expect((await call(`/grids/${g.id}`)).status).toBe(404);
    });

    it('is private to its owner for editing', async () => {
        const { make, call, secondUser } = await setup();
        const g = await make();
        const other = await secondUser();
        expect((await call(`/grids/${g.id}`, 'GET', undefined, other)).status).toBe(404);
        expect((await call(`/grids/${g.id}`, 'PATCH', { title: 'x' }, other)).status).toBe(404);
        expect((await call(`/grids/${g.id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect((await call(`/grids/${g.id}/cells/0`, 'PUT', { label: 'x' }, other)).status).toBe(
            404
        );
        expect((await call('/grids', 'GET', undefined, other)).grids).toEqual([]);
    });

    it('is public by username and id, without logging in', async () => {
        const { app, make, cell } = await setup();
        const g = await make({ title: 'Public one' });
        await cell(g.id, 0, { label: 'Fav', igdbId: 3 });
        const res = await app.request(`/api/profiles/user_me/grids/${g.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.grid).toMatchObject({ username: 'user_me', title: 'Public one' });
        expect(body.grid.cells[0]).toMatchObject({ label: 'Fav', game: { name: 'Hollow Knight' } });
        // wrong owner or unknown id
        expect((await app.request(`/api/profiles/user_two/grids/${g.id}`)).status).toBe(404);
        expect((await app.request(`/api/profiles/user_me/grids/999`)).status).toBe(404);
        // listed as a tile on the profile
        const profile = (await (await app.request('/api/profiles/user_me')).json()) as any;
        expect(profile.profile.grids).toMatchObject([{ id: g.id, filled: 1, covers: ['co3'] }]);
    });

    it('keeps a game cached while a grid uses it', async () => {
        const { make, cell, db } = await setup();
        const g = await make();
        await cell(g.id, 0, { igdbId: 2 });
        purgeUnusedGames(db);
        expect(
            db
                .select()
                .from(games)
                .all()
                .map((x) => x.id)
        ).toEqual([2]);
    });

    it('limits how many grids a user can have', async () => {
        const { call } = await setup();
        for (let i = 0; i < 50; i++) await call('/grids', 'POST', { title: `g${i}` });
        expect((await call('/grids', 'POST', { title: 'one too many' })).status).toBe(409);
    });
});
