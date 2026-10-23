import { eq, inArray } from 'drizzle-orm';
import type { GameOffersResponse, GamePriceDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { gamePrices, games } from '../db/schema.js';
import type { ItadClient } from '../itad/types.js';
import { HttpError } from '../errors.js';
import { TtlCache } from '../igdb/search-cache.js';
import { reportError } from './error-log.js';

/** Prices move daily at most; asking every few hours keeps us far below ITAD's rate limit. */
export const PRICE_REFRESH_MS = 6 * 3600_000;
/** A game ITAD didn't recognise is unlikely to appear soon, so it is looked up less often. */
export const UNMATCHED_RETRY_MS = 7 * 24 * 3600_000;
const LOOKUP_CONCURRENCY = 6;

type PriceRow = typeof gamePrices.$inferSelect;

export function toPriceDto(row: PriceRow | undefined): GamePriceDto | null {
    if (!row || row.amount === null || !row.currency || !row.shop || !row.url) return null;
    return {
        currency: row.currency,
        amount: row.amount,
        regular: row.regular ?? row.amount,
        cut: row.cut ?? 0,
        shop: row.shop,
        url: row.url,
        historyLow: row.historyLow,
        checkedAt: row.checkedAt
    };
}

export function loadPrices(db: Db, gameIds: number[]): Map<number, GamePriceDto | null> {
    if (gameIds.length === 0) return new Map();
    return new Map(
        db
            .select()
            .from(gamePrices)
            .where(inArray(gamePrices.gameId, gameIds))
            .all()
            .map((r) => [r.gameId, toPriceDto(r)])
    );
}

/**
 * Brings the cached prices of these games up to date: matches games to ITAD by title once, then
 * asks for all stale prices in one request. Best effort, like the release-date refresh: a failure
 * is recorded and the cached prices are served.
 */
export async function refreshPrices(
    db: Db,
    itad: ItadClient | undefined,
    gameIds: number[],
    now = Date.now()
) {
    if (!itad || gameIds.length === 0) return;
    const cached = new Map(
        db
            .select()
            .from(gamePrices)
            .where(inArray(gamePrices.gameId, gameIds))
            .all()
            .map((r) => [r.gameId, r])
    );
    const due = db
        .select({ id: games.id, name: games.name })
        .from(games)
        .where(inArray(games.id, gameIds))
        .all()
        .filter(({ id }) => {
            const row = cached.get(id);
            if (!row || row.country !== itad.country) return true;
            return row.checkedAt < now - (row.itadId ? PRICE_REFRESH_MS : UNMATCHED_RETRY_MS);
        });
    if (due.length === 0) return;

    try {
        const itadIds = new Map<number, string | null>();
        const toMatch = due.filter(({ id }) => !cached.get(id)?.itadId);
        for (const { id } of due) itadIds.set(id, cached.get(id)?.itadId ?? null);
        for (let i = 0; i < toMatch.length; i += LOOKUP_CONCURRENCY)
            await Promise.all(
                toMatch.slice(i, i + LOOKUP_CONCURRENCY).map(async ({ id, name }) => {
                    itadIds.set(id, await itad.lookup(name));
                })
            );

        const known = [...new Set([...itadIds.values()].filter((v): v is string => v !== null))];
        const prices = known.length ? await itad.prices(known) : new Map();

        db.transaction((tx) => {
            for (const { id } of due) {
                const itadId = itadIds.get(id) ?? null;
                const p = itadId ? prices.get(itadId) : undefined;
                const values = {
                    itadId,
                    currency: p?.currency ?? null,
                    amount: p?.amount ?? null,
                    regular: p?.regular ?? null,
                    cut: p?.cut ?? null,
                    shop: p?.shop ?? null,
                    url: p?.url ?? null,
                    historyLow: p?.historyLow ?? null,
                    country: itad.country,
                    checkedAt: now
                };
                tx.insert(gamePrices)
                    .values({ gameId: id, ...values })
                    .onConflictDoUpdate({ target: gamePrices.gameId, set: values })
                    .run();
            }
        });
    } catch (e) {
        reportError(db, 'job_price_refresh', e, { context: { games: due.length } });
    }
}

/** Offers change slowly and a game page may be reopened often; keep them for a short while. */
export const offersCache = () => new TtlCache<GameOffersResponse['offers']>(30 * 60_000, 200);

/**
 * Every shop's price for one game, for its detail page. Uses the ITAD id from the price cache when
 * the game is on someone's wishlist, otherwise matches by title. Unlike the wishlist refresh this is
 * a direct answer to the user's request, so an ITAD failure is reported as a 502 for the page to show.
 */
export async function gameOffers(
    db: Db,
    itad: ItadClient | undefined,
    cache: TtlCache<GameOffersResponse['offers']>,
    gameId: number
): Promise<GameOffersResponse> {
    if (!itad) return { enabled: false, offers: null };
    const hit = cache.get(`${itad.country}:${gameId}`);
    if (hit !== undefined) return { enabled: true, offers: hit };
    try {
        const game = db.select({ name: games.name }).from(games).where(eq(games.id, gameId)).get();
        if (!game) throw new HttpError(404, 'Game not found');
        const row = db.select().from(gamePrices).where(eq(gamePrices.gameId, gameId)).get();
        const itadId =
            row?.itadId && row.country === itad.country ? row.itadId : await itad.lookup(game.name);
        const offers = itadId ? await itad.offers(itadId) : null;
        cache.set(`${itad.country}:${gameId}`, offers);
        return { enabled: true, offers };
    } catch (e) {
        if (e instanceof HttpError) throw e;
        reportError(db, 'job_price_refresh', e, { context: { gameId } });
        throw new HttpError(502, 'Could not load prices right now');
    }
}
