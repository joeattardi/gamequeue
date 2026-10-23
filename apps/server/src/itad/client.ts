import { isMajorShop } from '@gamequeue/shared';
import { ItadError, type ItadClient, type ItadOffers, type ItadPrice } from './types.js';

const BASE = 'https://api.isthereanydeal.com';
/** `/games/prices/v3` takes at most 200 ids per request */
const PRICE_BATCH = 200;

interface RawAmount {
    amountInt: number;
    currency: string;
}
interface RawDeal {
    shop: { name: string };
    price: RawAmount;
    regular: RawAmount;
    cut: number;
    url: string;
    platforms?: { name: string }[];
    drm?: { name: string }[];
}
interface RawPrices {
    id: string;
    historyLow?: { all?: RawAmount | null } | null;
    deals?: RawDeal[];
}
interface RawLookup {
    found: boolean;
    game?: { id: string; title: string };
}

/** Lowercase letters and digits only, so "Hades II" and "hades ii!" compare equal. */
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export interface ItadClientOptions {
    apiKey: string;
    country: string;
    fetchFn?: typeof fetch;
}

/**
 * ITAD allows 1000 requests per 5 minutes; the callers cache for hours, so no limiter is needed.
 * The key travels in a header rather than the URL so it can't end up in logs.
 */
export function createItadClient(opts: ItadClientOptions): ItadClient {
    const fetchFn = opts.fetchFn ?? fetch;

    async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
        let res: Response;
        try {
            res = await fetchFn(`${BASE}${path}`, {
                ...init,
                headers: {
                    'ITAD-API-Key': opts.apiKey,
                    ...(init.body ? { 'content-type': 'application/json' } : {})
                },
                signal: AbortSignal.timeout(10_000)
            });
        } catch (e) {
            throw new ItadError(`ITAD request failed: ${(e as Error).message}`);
        }
        if (!res.ok)
            throw new ItadError(`ITAD ${path.split('?')[0]} returned ${res.status}`, res.status);
        return (await res.json()) as T;
    }

    async function fetchPrices(ids: string[]): Promise<RawPrices[]> {
        const rows: RawPrices[] = [];
        for (let i = 0; i < ids.length; i += PRICE_BATCH)
            rows.push(
                ...(await call<RawPrices[]>(
                    `/games/prices/v3?country=${encodeURIComponent(opts.country)}`,
                    { method: 'POST', body: JSON.stringify(ids.slice(i, i + PRICE_BATCH)) }
                ))
            );
        return rows;
    }

    return {
        country: opts.country,
        async lookup(title) {
            const r = await call<RawLookup>(`/games/lookup/v1?title=${encodeURIComponent(title)}`);
            // The lookup is fuzzy; a wrong game's price is worse than none, so require the same title
            return r.found && r.game && normalize(r.game.title) === normalize(title)
                ? r.game.id
                : null;
        },
        async prices(ids) {
            const out = new Map<string, ItadPrice | null>();
            for (const row of await fetchPrices(ids)) {
                // Prefer well-known shops, as the game page does; any shop if there is none
                const all = row.deals ?? [];
                const major = all.filter((d) => isMajorShop(d.shop.name));
                const best = (major.length ? major : all).reduce<RawDeal | undefined>(
                    (a, d) => (!a || d.price.amountInt < a.price.amountInt ? d : a),
                    undefined
                );
                out.set(
                    row.id,
                    best
                        ? {
                              currency: best.price.currency,
                              amount: best.price.amountInt,
                              regular: best.regular.amountInt,
                              cut: best.cut,
                              shop: best.shop.name,
                              url: best.url,
                              historyLow: row.historyLow?.all?.amountInt ?? null
                          }
                        : null
                );
            }
            return out;
        },
        async offers(id): Promise<ItadOffers | null> {
            const row = (await fetchPrices([id]))[0];
            const deals = [...(row?.deals ?? [])].sort(
                (a, b) => a.price.amountInt - b.price.amountInt
            );
            if (!row || deals.length === 0) return null;
            return {
                currency: deals[0]!.price.currency,
                historyLow: row.historyLow?.all?.amountInt ?? null,
                deals: deals.map((d) => ({
                    shop: d.shop.name,
                    amount: d.price.amountInt,
                    regular: d.regular.amountInt,
                    cut: d.cut,
                    url: d.url,
                    platforms: (d.platforms ?? []).map((p) => p.name),
                    drm: (d.drm ?? []).map((p) => p.name)
                }))
            };
        }
    };
}
