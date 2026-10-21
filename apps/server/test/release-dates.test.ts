import { describe, expect, it, vi } from 'vitest';
import { games } from '../src/db/schema.js';
import { mapRelease } from '../src/igdb/mappers.js';
import { RELEASE_REFRESH_MS, refreshReleaseDates } from '../src/services/games.js';
import { cookieFrom, fakeGame, fakeIgdb, makeApp, register } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('mapRelease', () => {
    const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;

    it('reads the precision from the release date that is the first one', () => {
        const first = at('2028-12-31');
        expect(
            mapRelease({
                first_release_date: first,
                release_dates: [
                    { date: first, date_format: 2 },
                    { date: first, date_format: { id: 2 } }
                ]
            })
        ).toEqual({ releaseDate: '2028-12-31', releasePrecision: 'year' });
        expect(
            mapRelease({
                first_release_date: first,
                release_dates: [{ date: first, date_format: 6 }]
            })
        ).toMatchObject({ releasePrecision: 'quarter' });
        expect(
            mapRelease({
                first_release_date: first,
                release_dates: [{ date: first, date_format: 1 }]
            })
        ).toMatchObject({ releasePrecision: 'month' });
    });

    it('prefers the most exact precision among platforms sharing the date', () => {
        const d = at('2027-02-23');
        expect(
            mapRelease({
                first_release_date: d,
                release_dates: [
                    { date: d, date_format: 1 },
                    { date: d, date_format: 0 }
                ]
            })
        ).toEqual({ releaseDate: '2027-02-23', releasePrecision: 'day' });
    });

    it('ignores later platform dates, and leaves precision unknown without a match', () => {
        const d = at('2027-02-18');
        expect(
            mapRelease({
                first_release_date: d,
                release_dates: [{ date: at('2027-02-23'), date_format: 2 }]
            })
        ).toEqual({ releaseDate: '2027-02-18', releasePrecision: null });
        expect(mapRelease({})).toEqual({ releaseDate: null, releasePrecision: null });
    });

    it('treats a TBD format as no date', () => {
        const d = at('2030-12-31');
        expect(
            mapRelease({ first_release_date: d, release_dates: [{ date: d, date_format: 7 }] })
        ).toEqual({ releaseDate: null, releasePrecision: null });
    });
});

async function setup() {
    const catalog = [
        fakeGame(1, 'Hades'),
        fakeGame(2, 'Silksong', { releaseDate: '2027-12-31', releasePrecision: 'year' }),
        fakeGame(3, 'Mystery', { releaseDate: null, releasePrecision: null })
    ];
    const { client, calls } = fakeIgdb(catalog);
    const { app, db } = makeApp({}, client);
    const cookie = cookieFrom(await register(app));
    const call = async (path: string, method = 'GET', body?: unknown) =>
        (
            await app.request(`/api${path}`, {
                method,
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                headers: {
                    origin: 'http://localhost',
                    cookie,
                    ...(body === undefined ? {} : { 'content-type': 'application/json' })
                }
            })
        ).json() as Promise<Record<string, any>>;
    const wishlist = async () => (await call('/wishlist')).wishlist;
    return { catalog, client, calls, db, call, wishlist };
}

describe('release dates on the wishlist', () => {
    it('comes with the date and how exact it is', async () => {
        const { call, wishlist } = await setup();
        for (const igdbId of [1, 2, 3]) await call('/wishlist/items', 'POST', { igdbId });
        expect((await wishlist()).items.map((i: any) => i.game)).toMatchObject([
            { releaseDate: '2020-05-01', releasePrecision: 'day' },
            { releaseDate: '2027-12-31', releasePrecision: 'year' },
            { releaseDate: null, releasePrecision: null }
        ]);
    });

    it('picks up a changed date for an unreleased game, at most once a day', async () => {
        const { call, wishlist, catalog, calls } = await setup();
        await call('/wishlist/items', 'POST', { igdbId: 2 });
        expect(calls.fetchReleaseDates).toBe(0); // just fetched, so not due

        catalog[1]!.releaseDate = '2027-03-04';
        catalog[1]!.releasePrecision = 'day';
        expect((await wishlist()).items[0].game.releaseDate).toBe('2027-12-31');
        expect(calls.fetchReleaseDates).toBe(0);

        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(Date.now() + RELEASE_REFRESH_MS + 1000);
            expect((await wishlist()).items[0].game).toMatchObject({
                releaseDate: '2027-03-04',
                releasePrecision: 'day'
            });
            expect(calls.fetchReleaseDates).toBe(1);
            await wishlist();
            expect(calls.fetchReleaseDates).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('checks every due game in one request and skips released games', async () => {
        const { call, db, client, catalog } = await setup();
        for (const igdbId of [1, 2, 3]) await call('/wishlist/items', 'POST', { igdbId });
        const spy = vi.spyOn(client, 'fetchReleaseDates');
        catalog[2]!.releaseDate = '2027-05-01';
        catalog[2]!.releasePrecision = 'month';
        await refreshReleaseDates(db, client, [1, 2, 3], Date.now() + 2 * DAY);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith([2, 3]); // Hades is out, so it is never asked about
        expect(
            db
                .select()
                .from(games)
                .all()
                .find((g) => g.id === 3)
        ).toMatchObject({
            releaseDate: '2027-05-01',
            releasePrecision: 'month'
        });
    });

    it('keeps the cached dates when IGDB fails', async () => {
        const { call, wishlist, client } = await setup();
        await call('/wishlist/items', 'POST', { igdbId: 2 });
        client.fetchReleaseDates = async () => {
            throw new Error('IGDB down');
        };
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(Date.now() + 2 * DAY);
            expect((await wishlist()).items[0].game.releaseDate).toBe('2027-12-31');
            expect(error).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
            error.mockRestore();
        }
    });
});
