import { and, eq, inArray } from 'drizzle-orm';
import type { SimilarGameDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, wishlistItems, wishlists } from '../db/schema.js';
import { TtlCache } from '../igdb/search-cache.js';
import type { IgdbClient, IgdbSearchHit } from '../igdb/types.js';
import { callIgdb, requireIgdb } from './games.js';

/** Similar-game lists barely change, so one IGDB lookup per game per few hours is plenty. */
const SIMILAR_TTL_MS = 6 * 3600_000;
export const MAX_SIMILAR = 12;

export const similarCache = () => new TtlCache<IgdbSearchHit[]>(SIMILAR_TTL_MS, 200);

/** IGDB's raw similar list for a game, through the cache */
export async function similarHits(
    igdb: IgdbClient | undefined,
    cache: TtlCache<IgdbSearchHit[]>,
    igdbId: number
): Promise<IgdbSearchHit[]> {
    const key = String(igdbId);
    let hits = cache.get(key);
    if (!hits) {
        hits = await callIgdb(() => requireIgdb(igdb).fetchSimilarGames(igdbId));
        cache.set(key, hits);
    }
    return hits;
}

/**
 * IGDB's similar games for one game, best rated first (unrated last), each marked with whether
 * the user owns or wishlisted it. The IGDB list is cached; the marks are per user and never are.
 */
export async function similarGames(
    db: Db,
    igdb: IgdbClient | undefined,
    cache: TtlCache<IgdbSearchHit[]>,
    userId: number,
    igdbId: number
): Promise<SimilarGameDto[]> {
    const top = (await similarHits(igdb, cache, igdbId))
        .filter((h) => h.id !== igdbId)
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
        .slice(0, MAX_SIMILAR);
    if (top.length === 0) return [];
    const ids = top.map((h) => h.id);
    const owned = new Map(
        db
            .select({ gameId: entries.gameId, id: entries.id })
            .from(entries)
            .where(and(eq(entries.userId, userId), inArray(entries.gameId, ids)))
            .all()
            .map((e) => [e.gameId, e.id])
    );
    const wished = new Set(
        db
            .select({ gameId: wishlistItems.gameId })
            .from(wishlistItems)
            .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
            .where(and(eq(wishlists.userId, userId), inArray(wishlistItems.gameId, ids)))
            .all()
            .map((r) => r.gameId)
    );
    return top.map((h) => ({
        igdbId: h.id,
        name: h.name,
        year: h.year,
        coverImageId: h.coverImageId,
        igdbRating: h.rating,
        entryId: owned.get(h.id) ?? null,
        wishlisted: wished.has(h.id)
    }));
}
