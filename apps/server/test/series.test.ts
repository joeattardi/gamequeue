import { describe, expect, it, vi } from 'vitest';
import { games, series } from '../src/db/schema.js';
import { backfillSeries } from '../src/services/games.js';
import { SERIES_REFRESH_MS } from '../src/services/series.js';
import { PC, cookieFrom, fakeGame, fakeIgdb, makeApp, register } from './helpers.js';

const WITCHER = { id: 62, name: 'The Witcher' };
const OTHER = { id: 70, name: 'Other Series' };

async function setup() {
    const catalog = [
        fakeGame(1, 'Witcher 1', { releaseDate: '2007-10-26', series: [WITCHER] }),
        fakeGame(2, 'Witcher 2', { releaseDate: '2011-05-17', series: [WITCHER] }),
        fakeGame(3, 'Witcher 3', { releaseDate: '2015-05-19', series: [WITCHER, OTHER] }),
        fakeGame(4, 'Witcher IV', {
            releaseDate: '2028-12-31',
            releasePrecision: 'year',
            series: [WITCHER]
        }),
        fakeGame(5, 'Standalone', { series: [] })
    ];
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
    const add = async (igdbId: number) =>
        (await call('/entries', 'POST', { igdbId, platformIds: [PC.id] })).entry;
    return { catalog, client, calls, db, call, add };
}

describe('series on games', () => {
    it('are stored when a game is added and come with the game', async () => {
        const { add, call } = await setup();
        const e = await add(3);
        expect(e.game.series).toEqual([OTHER, WITCHER]); // by name
        expect((await call(`/entries/${e.id}`)).entry.game.series).toHaveLength(2);
        expect((await add(5)).game.series).toEqual([]);
    });

    it('filter the collection, and are only offered once you own two of them', async () => {
        const { add, call } = await setup();
        await add(1);
        await add(5);
        expect((await call('/entries/facet-counts')).series).toEqual([]);
        await add(3);
        expect((await call('/entries/facet-counts')).series).toEqual([
            { id: WITCHER.id, name: WITCHER.name, count: 2 }
        ]);
        const names = (r: Record<string, any>) => r.entries.map((e: any) => e.game.name);
        expect(names(await call(`/entries?series=${WITCHER.id}`))).toEqual([
            'Witcher 1',
            'Witcher 3'
        ]);
        expect(names(await call(`/entries?series=${OTHER.id}&series=${WITCHER.id}`))).toHaveLength(
            2
        );
        // a selected series stays offered even with one game left in it
        expect((await call(`/entries/facet-counts?series=${OTHER.id}`)).series).toEqual([
            { id: OTHER.id, name: OTHER.name, count: 1 },
            { id: WITCHER.id, name: WITCHER.name, count: 2 }
        ]);
    });
});

describe('backfillSeries', () => {
    it('learns the series of games cached before they were stored, once', async () => {
        const { db, client, calls, catalog } = await setup();
        const insert = (id: number) =>
            db
                .insert(games)
                .values({ id, name: `G${id}`, fetchedAt: 1 })
                .run();
        for (const id of [1, 3, 5]) insert(id);
        await backfillSeries(db, client);
        expect(calls.fetchGameSeries).toBe(1);
        const rows = db.select().from(series).all();
        expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([WITCHER.id, OTHER.id]);
        await backfillSeries(db, client);
        expect(calls.fetchGameSeries).toBe(1);
        expect(catalog).toHaveLength(5);
    });

    it('leaves games unchecked when IGDB fails, to retry later', async () => {
        const { db, client } = await setup();
        db.insert(games).values({ id: 1, name: 'G1', fetchedAt: 1 }).run();
        client.fetchGameSeries = async () => {
            throw new Error('down');
        };
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        await backfillSeries(db, client);
        error.mockRestore();
        expect(db.select().from(games).get()!.seriesCheckedAt).toBeNull();
    });
});

describe('series page', () => {
    it('lists the games in release order with what you have of them', async () => {
        const { add, call, catalog } = await setup();
        const w3 = await add(3);
        await add(1);
        await call('/wishlist/items', 'POST', { igdbId: 2 });
        const { series: s } = await call(`/series/${WITCHER.id}`);
        expect(s.name).toBe('The Witcher');
        expect(s.members.map((m: any) => m.name)).toEqual([
            'Witcher 1',
            'Witcher 2',
            'Witcher 3',
            'Witcher IV'
        ]);
        expect(s.members.map((m: any) => [!!m.entry, m.wishlisted])).toEqual([
            [true, false],
            [false, true],
            [true, false],
            [false, false]
        ]);
        expect(s.members[2].entry).toMatchObject({ id: w3.id, status: 'unplayed', queued: false });
        expect(s.members[3]).toMatchObject({ releaseDate: '2028-12-31', releasePrecision: 'year' });
        expect(catalog).toHaveLength(5);
    });

    it('shows a game you own even if IGDB does not list it in the series', async () => {
        const { add, call, client } = await setup();
        const listed = client.fetchSeries.bind(client);
        client.fetchSeries = async (id) => {
            const record = await listed(id);
            return record && { ...record, games: record.games.filter((g) => g.id !== 2) };
        };
        const before = (await call(`/series/${WITCHER.id}`)).series.members;
        expect(before.map((m: any) => m.name)).not.toContain('Witcher 2');
        await add(2); // an edition or port IGDB files under the series, but not as a main entry
        const after = (await call(`/series/${WITCHER.id}`)).series.members;
        expect(after.map((m: any) => m.name)).toEqual([
            'Witcher 1',
            'Witcher 2',
            'Witcher 3',
            'Witcher IV'
        ]);
        expect(after[1].entry).toMatchObject({ status: 'unplayed' });
    });

    it('caches the list for a week, and falls back to it when IGDB is down', async () => {
        const { call, calls, client } = await setup();
        await call(`/series/${WITCHER.id}`);
        await call(`/series/${WITCHER.id}`);
        expect(calls.fetchSeries).toBe(1);
        vi.useFakeTimers({ toFake: ['Date'] });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            vi.setSystemTime(Date.now() + SERIES_REFRESH_MS + 1000);
            await call(`/series/${WITCHER.id}`);
            expect(calls.fetchSeries).toBe(2);
            client.fetchSeries = async () => {
                throw new Error('down');
            };
            vi.setSystemTime(Date.now() + SERIES_REFRESH_MS + 1000);
            const res = await call(`/series/${WITCHER.id}`);
            expect(res.status).toBe(200);
            expect(res.series.members).toHaveLength(4);
        } finally {
            vi.useRealTimers();
            error.mockRestore();
        }
    });

    it('is 404 for a series IGDB does not know, and needs a login', async () => {
        const { call } = await setup();
        expect((await call('/series/999')).status).toBe(404);
        expect((await call('/series/abc')).status).toBe(404);
    });

    it('queues the unplayed games you own in release order, once', async () => {
        const { add, call } = await setup();
        const e3 = await add(3);
        const e1 = await add(1);
        const e2 = await add(2);
        await call(`/entries/${e2.id}/start`, 'POST', {});
        expect((await call(`/series/${WITCHER.id}/queue`, 'POST')).added).toBe(2);
        const q = (await call('/queue')).list.entries.map((e: any) => e.id);
        expect(q).toEqual([e1.id, e3.id]);
        expect((await call(`/series/${WITCHER.id}/queue`, 'POST')).added).toBe(0);
        expect((await call(`/series/${WITCHER.id}`)).series.members[0].entry.queued).toBe(true);
    });
});
