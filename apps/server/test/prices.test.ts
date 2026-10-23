import { describe, expect, it } from 'vitest';
import { createItadClient } from '../src/itad/client.js';
import { ItadError, type ItadClient, type ItadPrice } from '../src/itad/types.js';
import { refreshPrices } from '../src/services/prices.js';
import { CATALOG, setupApi } from './api.js';

const HADES: ItadPrice = {
    currency: 'USD',
    amount: 1249,
    regular: 2499,
    cut: 50,
    shop: 'Steam',
    url: 'https://itad.example/link/hades',
    historyLow: 999
};

/** Knows Hades and Celeste (Celeste is not sold anywhere); counts calls. */
function fakeItad(fail = false) {
    const calls = { lookup: 0, prices: 0 };
    const client: ItadClient = {
        country: 'US',
        async lookup(title) {
            calls.lookup++;
            if (fail) throw new ItadError('boom', 500);
            return { Hades: 'itad-hades', Celeste: 'itad-celeste' }[title] ?? null;
        },
        async prices(ids) {
            calls.prices++;
            return new Map(ids.map((id) => [id, id === 'itad-hades' ? HADES : null]));
        }
    };
    return { client, calls };
}

describe('wishlist prices', () => {
    it('are absent without an ITAD client', async () => {
        const { call } = await setupApi();
        await call('/wishlist/items', 'POST', { igdbId: 1 });
        expect((await call('/wishlist')).wishlist.items[0].price).toBeNull();
    });

    it('show the cheapest price, and unknown or unsold games get none', async () => {
        const { client } = fakeItad();
        const { call } = await setupApi(CATALOG, client);
        for (const id of [1, 2, 3]) await call('/wishlist/items', 'POST', { igdbId: id });
        const items = (await call('/wishlist')).wishlist.items;
        expect(items.map((i: any) => i.price?.amount ?? null)).toEqual([1249, null, null]);
        expect(items[0].price).toMatchObject({ cut: 50, shop: 'Steam', historyLow: 999 });
    });

    it('are cached between loads', async () => {
        const { client, calls } = fakeItad();
        const { call } = await setupApi(CATALOG, client);
        await call('/wishlist/items', 'POST', { igdbId: 1 });
        await call('/wishlist');
        await call('/wishlist');
        expect(calls).toEqual({ lookup: 1, prices: 1 });
    });

    it('refresh when stale, without looking the game up again', async () => {
        const { client, calls } = fakeItad();
        const { call, db } = await setupApi(CATALOG, client);
        await call('/wishlist/items', 'POST', { igdbId: 1 });
        await call('/wishlist');
        await refreshPrices(db, client, [1], Date.now() + 7 * 3600_000);
        expect(calls).toEqual({ lookup: 1, prices: 2 });
    });

    it('survive an ITAD failure: the wishlist still loads, and the error is logged', async () => {
        const { client } = fakeItad(true);
        const { call } = await setupApi(CATALOG, client);
        await call('/wishlist/items', 'POST', { igdbId: 1 });
        const res = await call('/wishlist');
        expect(res.status).toBe(200);
        expect(res.wishlist.items[0].price).toBeNull();
    });
});

describe('ITAD client', () => {
    const fetchFn = (routes: Record<string, unknown>) =>
        (async (url: string | URL | Request) => {
            const u = String(url);
            const hit = Object.entries(routes).find(([k]) => u.includes(k));
            return hit
                ? new Response(JSON.stringify(hit[1]))
                : new Response('nope', { status: 404 });
        }) as typeof fetch;

    it('accepts only an exact title match', async () => {
        const itad = createItadClient({
            apiKey: 'k',
            country: 'US',
            fetchFn: fetchFn({
                'title=Hades': { found: true, game: { id: 'a', title: 'Hades' } },
                'title=Hades%20II': { found: true, game: { id: 'b', title: 'Hades' } }
            })
        });
        expect(await itad.lookup('Hades')).toBe('a');
        expect(await itad.lookup('Hades II')).toBeNull();
    });

    it('picks the lowest of the shops', async () => {
        const amt = (amountInt: number) => ({ amountInt, currency: 'USD' });
        const deal = (shop: string, p: number) => ({
            shop: { name: shop },
            price: amt(p),
            regular: amt(2000),
            cut: 0,
            url: `https://x/${shop}`
        });
        const itad = createItadClient({
            apiKey: 'k',
            country: 'US',
            fetchFn: fetchFn({
                'prices/v3': [
                    {
                        id: 'a',
                        historyLow: { all: amt(500) },
                        deals: [deal('GOG', 1500), deal('Steam', 1000)]
                    },
                    { id: 'b', deals: [] }
                ]
            })
        });
        const out = await itad.prices(['a', 'b']);
        expect(out.get('a')).toMatchObject({ shop: 'Steam', amount: 1000, historyLow: 500 });
        expect(out.get('b')).toBeNull();
    });

    it('throws ItadError on HTTP errors', async () => {
        const itad = createItadClient({ apiKey: 'k', country: 'US', fetchFn: fetchFn({}) });
        await expect(itad.lookup('x')).rejects.toBeInstanceOf(ItadError);
    });
});
