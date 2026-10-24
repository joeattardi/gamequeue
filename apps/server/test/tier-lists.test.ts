import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS } from '@gamequeue/shared';
import { fakeIgdb, makeApp, cookieFrom, register } from './helpers.js';
import { CATALOG, setupApi } from './api.js';
import { purgeUnusedGames } from '../src/services/maintenance.js';
import { games } from '../src/db/schema.js';

async function setup() {
    const s = await setupApi();
    const make = async (extra: Record<string, unknown> = {}) =>
        (await s.call('/tier-lists', 'POST', { title: 'My tiers', ...extra })).tierList;
    const add = (id: number, igdbId: number, tierId?: number | null) =>
        s.call(`/tier-lists/${id}/items`, 'POST', { igdbId, tierId });
    const move = (id: number, igdbId: number, tierId: number | null, toIndex: number) =>
        s.call(`/tier-lists/${id}/items/move`, 'PUT', { igdbId, tierId, toIndex });
    /** Game names per tier name, plus the pool as "unranked" */
    const layout = (t: any): Record<string, string[]> => ({
        ...Object.fromEntries(
            t.tiers.map((x: any) => [x.name, x.items.map((i: any) => i.game.name)])
        ),
        unranked: t.unranked.map((i: any) => i.game.name)
    });
    return { ...s, make, add, move, layout };
}

describe('tier lists', () => {
    it('starts with the default tiers, empty', async () => {
        const { make, call } = await setup();
        const t = await make();
        expect(t.tiers.map((x: any) => [x.name, x.color])).toEqual(
            DEFAULT_TIERS.map((x) => [x.name, x.color])
        );
        expect(t.tiers.every((x: any) => x.items.length === 0)).toBe(true);
        expect(t.unranked).toEqual([]);
        expect((await call('/tier-lists')).tierLists).toEqual([
            { id: t.id, title: 'My tiers', ranked: 0, covers: [] }
        ]);
        expect((await call('/tier-lists', 'POST', { title: '' })).status).toBe(400);
    });

    it('adds games to a tier or the pool, once each, caching from IGDB only when new', async () => {
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
        const t = (await call('/tier-lists', 'POST', { title: 'T' })).tierList;
        const s = t.tiers[0].id;
        const a = (await call(`/tier-lists/${t.id}/items`, 'POST', { igdbId: 1, tierId: s }))
            .tierList;
        expect(a.tiers[0].items.map((i: any) => i.game.name)).toEqual(['Hades']);
        const b = (await call(`/tier-lists/${t.id}/items`, 'POST', { igdbId: 2 })).tierList;
        expect(b.unranked.map((i: any) => i.game.name)).toEqual(['Celeste']);
        // again: no change, no IGDB call
        const again = (await call(`/tier-lists/${t.id}/items`, 'POST', { igdbId: 1 })).tierList;
        expect(again.tiers[0].items).toHaveLength(1);
        expect(again.unranked).toHaveLength(1);
        expect(igdb.calls.fetchGame).toBe(2);
        await call(`/tier-lists/${t.id}`);
        expect(igdb.calls.fetchGame).toBe(2);
        expect((await call(`/tier-lists/${t.id}/items`, 'POST', { igdbId: 999 })).status).toBe(404);
    });

    it('moves games within and between tiers, keeping every order dense', async () => {
        const { make, add, move, layout } = await setup();
        const t = await make();
        const [S, A] = [t.tiers[0].id, t.tiers[1].id];
        for (const g of [1, 2, 3]) await add(t.id, g, S);
        await add(t.id, 4);
        expect(layout((await move(t.id, 3, S, 0)).tierList)).toMatchObject({
            S: ['Hollow Knight', 'Hades', 'Celeste']
        });
        // across tiers, clamped to the end
        let r = (await move(t.id, 1, A, 99)).tierList;
        expect(layout(r)).toMatchObject({ S: ['Hollow Knight', 'Celeste'], A: ['Hades'] });
        // from the pool into the middle of a tier
        r = (await move(t.id, 4, S, 1)).tierList;
        expect(layout(r)).toMatchObject({
            S: ['Hollow Knight', 'Outer Wilds', 'Celeste'],
            unranked: []
        });
        // back to the pool
        r = (await move(t.id, 2, null, 0)).tierList;
        expect(layout(r)).toMatchObject({
            S: ['Hollow Knight', 'Outer Wilds'],
            unranked: ['Celeste']
        });
        // later moves still land where asked (positions were compacted)
        r = (await move(t.id, 1, S, 1)).tierList;
        expect(layout(r)).toMatchObject({ S: ['Hollow Knight', 'Hades', 'Outer Wilds'], A: [] });
    });

    it('rejects moving what is not there or into a foreign tier', async () => {
        const { make, add, move, call } = await setup();
        const t = await make();
        const other = await make({ title: 'Other' });
        await add(t.id, 1);
        expect((await move(t.id, 2, null, 0)).status).toBe(404);
        expect((await move(t.id, 1, other.tiers[0].id, 0)).status).toBe(404);
        expect((await add(t.id, 1, other.tiers[0].id)).status).toBe(404);
        expect(
            (await call(`/tier-lists/${t.id}/items/move`, 'PUT', { igdbId: 1, toIndex: 0 })).status
        ).toBe(400);
    });

    it('removes a game and closes the gap', async () => {
        const { make, add, call, move, layout } = await setup();
        const t = await make();
        const S = t.tiers[0].id;
        for (const g of [1, 2, 3]) await add(t.id, g, S);
        const r = (await call(`/tier-lists/${t.id}/items/2`, 'DELETE')).tierList;
        expect(layout(r).S).toEqual(['Hades', 'Hollow Knight']);
        expect(layout((await move(t.id, 3, S, 0)).tierList).S).toEqual(['Hollow Knight', 'Hades']);
        expect((await call(`/tier-lists/${t.id}/items/2`, 'DELETE')).status).toBe(404);
    });

    it('edits, adds, reorders and deletes tiers; a deleted tier sends its games to the pool', async () => {
        const { make, add, call, layout } = await setup();
        const t = await make();
        const [S, A] = [t.tiers[0].id, t.tiers[1].id];
        await add(t.id, 1);
        await add(t.id, 2, S);
        await add(t.id, 3, S);
        const renamed = (
            await call(`/tier-lists/${t.id}/tiers/${S}`, 'PATCH', { name: 'God', color: 'pink' })
        ).tierList;
        expect(renamed.tiers[0]).toMatchObject({ name: 'God', color: 'pink' });
        expect(
            (await call(`/tier-lists/${t.id}/tiers/${S}`, 'PATCH', { color: 'mauve' })).status
        ).toBe(400);
        expect((await call(`/tier-lists/${t.id}/tiers/${S}`, 'PATCH', {})).status).toBe(400);

        const added = (await call(`/tier-lists/${t.id}/tiers`, 'POST', { name: 'E' })).tierList;
        expect(added.tiers.at(-1)).toMatchObject({ name: 'E', color: 'gray' });

        const ids = added.tiers.map((x: any) => x.id).reverse();
        const rev = (await call(`/tier-lists/${t.id}/tiers/order`, 'PUT', { tierIds: ids }))
            .tierList;
        expect(rev.tiers.map((x: any) => x.name)).toEqual(['E', 'F', 'D', 'C', 'B', 'A', 'God']);
        expect(
            (await call(`/tier-lists/${t.id}/tiers/order`, 'PUT', { tierIds: ids.slice(1) })).status
        ).toBe(400);

        const gone = (await call(`/tier-lists/${t.id}/tiers/${S}`, 'DELETE')).tierList;
        expect(gone.tiers.map((x: any) => x.name)).not.toContain('God');
        expect(layout(gone).unranked).toEqual(['Hades', 'Celeste', 'Hollow Knight']);
        expect((await call(`/tier-lists/${t.id}/tiers/${A}`, 'GET')).status).toBe(404);
    });

    it('limits tiers per list', async () => {
        const { make, call } = await setup();
        const t = await make();
        for (let i = 0; i < 4; i++)
            expect(
                (await call(`/tier-lists/${t.id}/tiers`, 'POST', { name: `x${i}` })).status
            ).toBe(200);
        expect(
            (await call(`/tier-lists/${t.id}/tiers`, 'POST', { name: 'one too many' })).status
        ).toBe(409);
    });

    it('edits title and description and deletes', async () => {
        const { make, call } = await setup();
        const t = await make();
        const p = (await call(`/tier-lists/${t.id}`, 'PATCH', { title: 'New', description: 'D' }))
            .tierList;
        expect(p).toMatchObject({ title: 'New', description: 'D' });
        expect((await call(`/tier-lists/${t.id}`, 'PATCH', {})).status).toBe(400);
        expect((await call(`/tier-lists/${t.id}`, 'DELETE')).status).toBe(200);
        expect((await call(`/tier-lists/${t.id}`)).status).toBe(404);
    });

    it('is private to its owner for editing', async () => {
        const { make, add, call, secondUser } = await setup();
        const t = await make();
        const S = t.tiers[0].id;
        const other = await secondUser();
        const as = (path: string, method = 'GET', body?: unknown) =>
            call(path, method, body, other);
        expect((await as(`/tier-lists/${t.id}`)).status).toBe(404);
        expect((await as(`/tier-lists/${t.id}`, 'PATCH', { title: 'x' })).status).toBe(404);
        expect((await as(`/tier-lists/${t.id}`, 'DELETE')).status).toBe(404);
        expect((await as(`/tier-lists/${t.id}/items`, 'POST', { igdbId: 1 })).status).toBe(404);
        expect((await as(`/tier-lists/${t.id}/tiers/${S}`, 'DELETE')).status).toBe(404);
        expect(
            (
                await as(`/tier-lists/${t.id}/items/move`, 'PUT', {
                    igdbId: 1,
                    tierId: null,
                    toIndex: 0
                })
            ).status
        ).toBe(404);
        await add(t.id, 1);
        expect((await as('/tier-lists')).tierLists).toEqual([]);
    });

    it('is public by username and id, and a tile on the profile', async () => {
        const { app, make, add } = await setup();
        const t = await make({ title: 'Public tiers' });
        await add(t.id, 3, t.tiers[1].id);
        await add(t.id, 1, t.tiers[0].id);
        await add(t.id, 2); // unranked: not counted
        const res = await app.request(`/api/profiles/user_me/tier-lists/${t.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.tierList).toMatchObject({ username: 'user_me', title: 'Public tiers' });
        expect(body.tierList.tiers[1].items[0].game.name).toBe('Hollow Knight');
        expect((await app.request(`/api/profiles/user_two/tier-lists/${t.id}`)).status).toBe(404);
        expect((await app.request('/api/profiles/user_me/tier-lists/999')).status).toBe(404);
        const profile = (await (await app.request('/api/profiles/user_me')).json()) as any;
        // best tier first
        expect(profile.profile.tierLists).toEqual([
            { id: t.id, title: 'Public tiers', ranked: 2, covers: ['co1', 'co3'] }
        ]);
    });

    it('keeps a game cached while a tier list uses it', async () => {
        const { make, add, db } = await setup();
        const t = await make();
        await add(t.id, 2);
        purgeUnusedGames(db);
        expect(
            db
                .select()
                .from(games)
                .all()
                .map((x) => x.id)
        ).toEqual([2]);
    });

    it('limits how many tier lists a user can have', async () => {
        const { call } = await setup();
        for (let i = 0; i < 50; i++) await call('/tier-lists', 'POST', { title: `t${i}` });
        expect((await call('/tier-lists', 'POST', { title: 'one too many' })).status).toBe(409);
    });
});
