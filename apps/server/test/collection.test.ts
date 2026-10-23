import { describe, expect, it } from 'vitest';
import {
    cookieFrom,
    fakeGame,
    fakeIgdb,
    json,
    makeApp,
    PC,
    PS5,
    register,
    SWITCH
} from './helpers.js';

const catalog = [
    fakeGame(1, 'Hades', {
        releaseDate: '2020-09-17',
        igdbRating: 93,
        genres: [{ id: 25, name: 'Hack and slash' }],
        themes: [{ id: 17, name: 'Fantasy' }],
        ttb: { hastilySeconds: 60000, normallySeconds: 79200, completelySeconds: 180000, count: 5 }
    }),
    fakeGame(2, 'Celeste', {
        releaseDate: '2018-01-25',
        genres: [{ id: 8, name: 'Platform' }],
        themes: [],
        ttb: { hastilySeconds: 18000, normallySeconds: 28800, completelySeconds: 72000, count: 5 },
        platforms: [PC, SWITCH]
    }),
    fakeGame(3, 'Disco Elysium', { releaseDate: '2019-10-15', ttb: null, igdbRating: null }),
    fakeGame(4, 'Alan Wake', { releaseDate: null, platforms: [PC] })
];

async function setup() {
    const igdb = fakeIgdb(catalog);
    const { app, db } = makeApp({}, igdb.client);
    const cookie = cookieFrom(await register(app));
    const call = (path: string, init: RequestInit = {}) =>
        app.request(`/api${path}`, {
            ...init,
            headers: { origin: 'http://localhost', ...(init.headers as object), cookie }
        });
    const post = (path: string, body: unknown, method = 'POST') =>
        call(path, { ...json(body), method });
    const add = async (igdbId: number, platformIds = [PC.id], tags?: string[]) => {
        const res = await post('/entries', { igdbId, platformIds, tags });
        expect(res.status).toBe(201);
        return (await res.json()).entry;
    };
    const list = async (query = '') =>
        (await (await call(`/entries${query}`)).json()).entries as {
            id: number;
            game: { name: string };
            status: string;
        }[];
    return { app, db, igdb, call, post, add, list, cookie };
}

describe('adding games', () => {
    it('fetches from IGDB once, caches, and fills metadata', async () => {
        const { add, igdb } = await setup();
        const e = await add(1, [PC.id, PS5.id]);
        expect(igdb.calls.fetchGame).toBe(1);
        expect(e).toMatchObject({
            status: 'unplayed',
            rating: null,
            notes: '',
            ttbMinutes: 1320,
            game: {
                name: 'Hades',
                releaseDate: '2020-09-17',
                coverImageId: 'co1',
                igdbRating: 93,
                genres: ['Hack and slash'],
                themes: ['Fantasy'],
                ttb: { normally: 1320, hastily: 1000, completely: 3000 }
            }
        });
        expect(e.platforms.map((p: { id: number }) => p.id).sort()).toEqual([PC.id, PS5.id].sort());
    });

    it('does not re-fetch a cached game when a second user adds it', async () => {
        const { app, add, igdb } = await setup();
        await add(1);
        const cookie2 = cookieFrom(
            await app.request(
                '/api/auth/register',
                json({
                    username: 'user_two',
                    email: 'two@example.com',
                    password: 'another long pass'
                })
            )
        );
        const res = await app.request('/api/entries', {
            ...json({ igdbId: 1, platformIds: [PC.id] }),
            headers: { 'content-type': 'application/json', cookie: cookie2 }
        });
        expect(res.status).toBe(201);
        expect(igdb.calls.fetchGame).toBe(1);
    });

    it('pre-fills tags from genres and themes, or uses supplied tags', async () => {
        const { add } = await setup();
        expect((await add(1)).tags).toEqual(['fantasy', 'hack and slash']);
        expect((await add(2, [PC.id], ['Cozy', 'cozy', 'Hard'])).tags).toEqual(['Cozy', 'Hard']);
        expect((await add(3, [PC.id], [])).tags).toEqual([]);
    });

    it('can add a game already paused or abandoned, with matching history', async () => {
        const { post, call } = await setup();
        const paused = (
            await (
                await post('/entries', {
                    igdbId: 1,
                    platformIds: [PC.id],
                    status: 'paused',
                    date: '2026-01-05'
                })
            ).json()
        ).entry;
        expect(paused.status).toBe('paused');
        let history = (await (await call(`/entries/${paused.id}/playthroughs`)).json())
            .playthroughs;
        expect(history).toMatchObject([{ startedOn: '2026-01-05', outcome: null }]);

        const abandoned = (
            await (
                await post('/entries', { igdbId: 2, platformIds: [PC.id], status: 'abandoned' })
            ).json()
        ).entry;
        expect(abandoned.status).toBe('abandoned');
        history = (await (await call(`/entries/${abandoned.id}/playthroughs`)).json()).playthroughs;
        expect(history).toMatchObject([{ startedOn: null, endedOn: null, outcome: 'abandoned' }]);

        // A paused game can then be resumed like any other
        const resumed = await post(`/entries/${paused.id}/resume`, {});
        expect(resumed.status).toBe(200);
    });

    it('rejects duplicates with the existing entry id', async () => {
        const { add, post } = await setup();
        const e = await add(1);
        const res = await post('/entries', { igdbId: 1, platformIds: [PC.id] });
        expect(res.status).toBe(409);
        expect((await res.json()).entryId).toBe(e.id);
    });

    it('validates platforms and unknown games', async () => {
        const { post } = await setup();
        expect((await post('/entries', { igdbId: 1, platformIds: [] })).status).toBe(400);
        expect((await post('/entries', { igdbId: 1, platformIds: [99999] })).status).toBe(400);
        expect((await post('/entries', { igdbId: 777, platformIds: [PC.id] })).status).toBe(404);
    });

    it("returns 503 when IGDB isn't configured but still serves cached data", async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app));
        const res = await app.request('/api/entries', {
            ...json({ igdbId: 1, platformIds: [PC.id] }),
            headers: { 'content-type': 'application/json', cookie }
        });
        expect(res.status).toBe(503);
        expect(
            (await app.request('/api/igdb/search?q=hades', { headers: { cookie } })).status
        ).toBe(503);
        expect((await app.request('/api/entries', { headers: { cookie } })).status).toBe(200);
    });
});

describe('search', () => {
    it('flags collected games and serves repeat queries from cache', async () => {
        const { call, add, igdb } = await setup();
        const e = await add(2);
        const res = await (await call('/igdb/search?q=el')).json();
        expect(res.results.map((r: { igdbId: number }) => r.igdbId)).toEqual([2, 3]);
        expect(res.results[0].entryId).toBe(e.id);
        expect(res.results[1].entryId).toBeNull();
        // the IGDB rating comes along, and is null when IGDB has none
        expect(res.results.map((r: { igdbRating: number | null }) => r.igdbRating)).toEqual([
            80,
            null
        ]);
        await call('/igdb/search?q=EL'); // same query, different case
        expect(igdb.calls.search).toBe(1);
    });

    it('requires login and a long enough query', async () => {
        const { app, call } = await setup();
        expect((await app.request('/api/igdb/search?q=hades')).status).toBe(401);
        expect((await call('/igdb/search?q=h')).status).toBe(400);
    });

    it('serves a game by IGDB id, calling IGDB only the first time', async () => {
        const { call, post, add, igdb } = await setup();
        const first = await (await call('/igdb/games/1')).json();
        expect(first).toMatchObject({ entryId: null, wishlisted: false });
        expect(first.game).toMatchObject({ id: 1, name: 'Hades' });
        expect(igdb.calls.fetchGame).toBe(1);

        await post('/wishlist/items', { igdbId: 1 });
        expect((await (await call('/igdb/games/1')).json()).wishlisted).toBe(true);
        const e = await add(1); // adding reuses the cached game and leaves the wishlist
        const owned = await (await call('/igdb/games/1')).json();
        expect(owned).toMatchObject({ entryId: e.id, wishlisted: false });
        expect(igdb.calls.fetchGame).toBe(1);

        expect((await call('/igdb/games/999')).status).toBe(404);
        expect((await call('/igdb/games/abc')).status).toBe(400);
    });

    it('syncs the platform list from IGDB once', async () => {
        const { call, igdb } = await setup();
        const a = await (await call('/igdb/platforms')).json();
        expect(a.platforms.map((p: { id: number }) => p.id)).toContain(SWITCH.id);
        expect(igdb.calls.fetchPlatforms).toBe(1);
    });
});

describe('listing, filters and sorting', () => {
    async function seeded() {
        const s = await setup();
        await s.add(1, [PC.id, PS5.id]);
        await s.add(2, [SWITCH.id]);
        await s.add(3, [PC.id]);
        await s.add(4, [PC.id], ['short']);
        return s;
    }
    const names = (rows: { game: { name: string } }[]) => rows.map((r) => r.game.name);

    it('sorts by title, release, rating, ttb with missing values last', async () => {
        const { list } = await seeded();
        expect(names(await list())).toEqual(['Alan Wake', 'Celeste', 'Disco Elysium', 'Hades']);
        expect(names(await list('?sort=release'))).toEqual([
            'Hades',
            'Disco Elysium',
            'Celeste',
            'Alan Wake'
        ]);
        expect(names(await list('?sort=release&dir=asc'))).toEqual([
            'Celeste',
            'Disco Elysium',
            'Hades',
            'Alan Wake'
        ]);
        expect(names(await list('?sort=ttb'))).toEqual([
            'Celeste',
            'Alan Wake',
            'Hades',
            'Disco Elysium'
        ]);
    });

    it('filters by platform, genre, tag and search text', async () => {
        const { list } = await seeded();
        expect(names(await list(`?platform=${SWITCH.id}`))).toEqual(['Celeste']);
        expect(names(await list(`?platform=${PC.id}`))).toEqual([
            'Alan Wake',
            'Disco Elysium',
            'Hades'
        ]);
        expect(names(await list('?genre=25'))).toEqual(['Hades']);
        expect(names(await list('?tag=SHORT'))).toEqual(['Alan Wake']);
        expect(names(await list('?q=ELYS'))).toEqual(['Disco Elysium']);
        expect(names(await list(`?platform=${PC.id}&q=e`))).toEqual([
            'Alan Wake',
            'Disco Elysium',
            'Hades'
        ]);
    });

    it('combines repeated facet values as any-of, and different facets as AND', async () => {
        const { list } = await seeded();
        expect(names(await list(`?platform=${SWITCH.id}&platform=${PS5.id}`))).toEqual([
            'Celeste',
            'Hades'
        ]);
        expect(names(await list(`?platform=${SWITCH.id}&platform=${PC.id}&tag=short`))).toEqual([
            'Alan Wake'
        ]);
        expect(names(await list('?status=playing&status=finished'))).toEqual([]);
    });

    it('counts facet options against the other active facets only', async () => {
        const { call } = await seeded();
        const counts = async (qs = '') => (await call(`/entries/facet-counts${qs}`)).json();
        const plat = (f: { platforms: { id: number; count: number }[] }) =>
            Object.fromEntries(f.platforms.map((p) => [p.id, p.count]));

        expect(plat(await counts())).toEqual({ [PC.id]: 3, [PS5.id]: 1, [SWITCH.id]: 1 });
        // Selecting a platform doesn't zero out the other platforms, but narrows other facets
        const f = await counts(`?platform=${SWITCH.id}`);
        expect(plat(f)).toEqual({ [PC.id]: 3, [PS5.id]: 1, [SWITCH.id]: 1 });
        expect(f.statuses.find((s: { value: string }) => s.value === 'unplayed').count).toBe(1);
        expect(f.tags.find((t: { name: string }) => t.name === 'short').count).toBe(0);
        // The backlog view only offers its own status
        const b = await counts('?view=backlog');
        expect(b.statuses.map((s: { value: string }) => s.value)).toEqual(['unplayed']);
    });

    it('derives the backlog from status rather than storing it', async () => {
        const { list, db } = await seeded();
        const { entries } = await import('../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        expect(await list('?view=backlog')).toHaveLength(4);
        db.update(entries).set({ status: 'finished' }).where(eq(entries.gameId, 1)).run();
        db.update(entries).set({ status: 'playing' }).where(eq(entries.gameId, 2)).run();
        expect(names(await list('?view=backlog'))).toEqual(['Alan Wake', 'Disco Elysium']);
        expect(names(await list('?status=playing'))).toEqual(['Celeste']);
    });

    it('uses the manual time-to-beat override for sorting and display', async () => {
        const { list, post, add } = await setup();
        const a = await add(1); // 1320 min
        await add(2); // 480 min
        expect((await post(`/entries/${a.id}`, { ttbOverrideMinutes: 60 }, 'PATCH')).status).toBe(
            200
        );
        const rows = (await list('?sort=ttb')) as unknown as {
            game: { name: string };
            ttbMinutes: number;
        }[];
        expect(rows.map((r) => [r.game.name, r.ttbMinutes])).toEqual([
            ['Hades', 60],
            ['Celeste', 480]
        ]);
    });

    it("returns facets from the user's own collection", async () => {
        const { call } = await seeded();
        const f = await (await call('/entries/facets')).json();
        expect(f.platforms.map((p: { id: number }) => p.id).sort()).toEqual(
            [PC.id, PS5.id, SWITCH.id].sort()
        );
        expect(f.tags).toContain('short');
        expect(f.genres.map((g: { name: string }) => g.name)).toContain('Platform');
    });

    it('rejects bad query params', async () => {
        const { call } = await seeded();
        expect((await call('/entries?sort=nope')).status).toBe(400);
    });
});

describe('editing and deleting', () => {
    it('updates rating, notes, platforms and tags', async () => {
        const { add, post } = await setup();
        const e = await add(1);
        const res = await post(
            `/entries/${e.id}`,
            { rating: 5, notes: 'Great', platformIds: [PS5.id], tags: ['roguelike', 'Fast'] },
            'PATCH'
        );
        const out = (await res.json()).entry;
        expect(out).toMatchObject({ rating: 5, notes: 'Great', tags: ['Fast', 'roguelike'] });
        expect(out.platforms.map((p: { id: number }) => p.id)).toEqual([PS5.id]);
    });

    it('validates patches', async () => {
        const { add, post } = await setup();
        const e = await add(1);
        for (const body of [
            { rating: 6 },
            { rating: 0 },
            { platformIds: [] },
            {},
            { ttbOverrideMinutes: -5 }
        ]) {
            expect((await post(`/entries/${e.id}`, body, 'PATCH')).status).toBe(400);
        }
        expect(
            (await post(`/entries/${e.id}`, { rating: null, ttbOverrideMinutes: null }, 'PATCH'))
                .status
        ).toBe(200);
    });

    it('deletes entries and cleans up now-unused tags', async () => {
        const { add, call, list } = await setup();
        const e = await add(1, [PC.id], ['only-here']);
        expect((await call(`/entries/${e.id}`, { method: 'DELETE' })).status).toBe(200);
        expect(await list()).toHaveLength(0);
        expect((await (await call('/entries/facets')).json()).tags).toEqual([]);
        expect((await call(`/entries/${e.id}`, { method: 'DELETE' })).status).toBe(404);
        expect((await call(`/entries/${e.id}`)).status).toBe(404);
    });

    it("keeps users' collections separate", async () => {
        const { app, add } = await setup();
        const e = await add(1);
        const cookie2 = cookieFrom(
            await app.request(
                '/api/auth/register',
                json({
                    username: 'user_two',
                    email: 'two@example.com',
                    password: 'another long pass'
                })
            )
        );
        const headers = { cookie: cookie2, 'content-type': 'application/json' };
        expect(await (await app.request('/api/entries', { headers })).json()).toEqual({
            entries: [],
            total: 0
        });
        expect((await app.request(`/api/entries/${e.id}`, { headers })).status).toBe(404);
        expect(
            (
                await app.request(`/api/entries/${e.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ rating: 1 })
                })
            ).status
        ).toBe(404);
        expect(
            (await app.request(`/api/entries/${e.id}`, { method: 'DELETE', headers })).status
        ).toBe(404);
    });

    it('requires authentication', async () => {
        const { app } = await setup();
        expect((await app.request('/api/entries')).status).toBe(401);
    });
});
