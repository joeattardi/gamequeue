import { and, desc, eq, gte, or } from 'drizzle-orm';
import type { DiscoverDto, DiscoverPickDto, SimilarGameDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { dismissedGames, entries, games, wishlistItems, wishlists } from '../db/schema.js';
import type { TtlCache } from '../igdb/search-cache.js';
import type { IgdbClient, IgdbSearchHit } from '../igdb/types.js';
import { reportError } from './error-log.js';
import { similarHits } from './similar.js';

/** Games to draw suggestions from; each costs one (cached) IGDB lookup */
export const MAX_SEEDS = 20;
export const MAX_PICKS = 12;
export const MAX_ROWS = 6;
export const MAX_ROW_GAMES = 8;
/** Rating (1-5) from which a game counts as loved */
export const LOVED_RATING = 4;

const toDto = (h: IgdbSearchHit): SimilarGameDto => ({
    igdbId: h.id,
    name: h.name,
    year: h.year,
    coverImageId: h.coverImageId,
    igdbRating: h.rating,
    entryId: null,
    wishlisted: false
});

const byRating = (a: IgdbSearchHit, b: IgdbSearchHit) => (b.rating ?? -1) - (a.rating ?? -1);

/**
 * Suggestions from IGDB's similar-game lists for the games the user loves (favorites first, then
 * 4+ star ratings, newest change first). A candidate scores one point per loved game it is similar
 * to, with IGDB's rating as a tie-breaker. Games already owned, wishlisted or dismissed never show.
 * A seed whose lookup fails is skipped; if every lookup fails the error is rethrown.
 */
export async function discover(
    db: Db,
    igdb: IgdbClient | undefined,
    cache: TtlCache<IgdbSearchHit[]>,
    userId: number
): Promise<DiscoverDto> {
    const seeds = db
        .select({ entryId: entries.id, igdbId: entries.gameId, name: games.name })
        .from(entries)
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(
            and(
                eq(entries.userId, userId),
                or(eq(entries.favorite, true), gte(entries.rating, LOVED_RATING))
            )
        )
        .orderBy(desc(entries.favorite), desc(entries.updatedAt))
        .limit(MAX_SEEDS)
        .all();
    if (seeds.length === 0) return { seedCount: 0, picks: [], rows: [] };

    const settled = await Promise.allSettled(seeds.map((s) => similarHits(igdb, cache, s.igdbId)));
    const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length === seeds.length) throw failures[0]!.reason;
    for (const f of failures) reportError(db, 'discover_lookup', f.reason);

    const hide = new Set<number>([
        ...db
            .select({ id: entries.gameId })
            .from(entries)
            .where(eq(entries.userId, userId))
            .all()
            .map((e) => e.id),
        ...db
            .select({ id: wishlistItems.gameId })
            .from(wishlistItems)
            .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
            .where(eq(wishlists.userId, userId))
            .all()
            .map((w) => w.id),
        ...db
            .select({ id: dismissedGames.gameId })
            .from(dismissedGames)
            .where(eq(dismissedGames.userId, userId))
            .all()
            .map((d) => d.id)
    ]);

    const candidates = new Map<number, { hit: IgdbSearchHit; seedNames: string[] }>();
    const rows: DiscoverDto['rows'] = [];
    seeds.forEach((seed, i) => {
        const result = settled[i]!;
        if (result.status !== 'fulfilled') return;
        const fresh = result.value.filter((h) => !hide.has(h.id) && h.id !== seed.igdbId);
        for (const h of fresh) {
            const c = candidates.get(h.id) ?? { hit: h, seedNames: [] };
            c.seedNames.push(seed.name);
            candidates.set(h.id, c);
        }
        if (fresh.length > 0 && rows.length < MAX_ROWS)
            rows.push({
                seed: { igdbId: seed.igdbId, name: seed.name, entryId: seed.entryId },
                games: [...fresh].sort(byRating).slice(0, MAX_ROW_GAMES).map(toDto)
            });
    });

    const picks: DiscoverPickDto[] = [...candidates.values()]
        .sort((a, b) => b.seedNames.length - a.seedNames.length || byRating(a.hit, b.hit))
        .slice(0, MAX_PICKS)
        .map((c) => ({
            ...toDto(c.hit),
            becauseOf: c.seedNames.slice(0, 3),
            seedMatches: c.seedNames.length
        }));
    return { seedCount: seeds.length, picks, rows };
}

export function dismissGame(db: Db, userId: number, igdbId: number) {
    db.insert(dismissedGames).values({ userId, gameId: igdbId }).onConflictDoNothing().run();
}

export function restoreGame(db: Db, userId: number, igdbId: number) {
    db.delete(dismissedGames)
        .where(and(eq(dismissedGames.userId, userId), eq(dismissedGames.gameId, igdbId)))
        .run();
}
