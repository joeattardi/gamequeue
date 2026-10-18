import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { searchQuerySchema, type SearchResultDto } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { entries, wishlistItems, wishlists } from '../db/schema.js';
import { validate } from '../http.js';
import { TtlCache } from '../igdb/search-cache.js';
import type { IgdbSearchHit } from '../igdb/types.js';
import { callIgdb, listPlatforms, requireIgdb } from '../services/games.js';

export function igdbRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    const cache = new TtlCache<IgdbSearchHit[]>();
    r.use('*', requireAuth(db, config));

    r.get('/search', async (c) => {
        const { q } = validate(searchQuerySchema, { q: c.req.query('q') });
        const key = q.toLowerCase();
        let hits = cache.get(key);
        if (!hits) {
            hits = await callIgdb(() => requireIgdb(igdb).search(q));
            cache.set(key, hits);
        }
        // Flag games already collected (per user, so never cached), and wishlisted ones
        const owned = hits.length
            ? new Map(
                  db
                      .select({ gameId: entries.gameId, id: entries.id })
                      .from(entries)
                      .where(
                          and(
                              eq(entries.userId, c.get('user').id),
                              inArray(
                                  entries.gameId,
                                  hits.map((h) => h.id)
                              )
                          )
                      )
                      .all()
                      .map((e) => [e.gameId, e.id])
              )
            : new Map<number, number>();
        const wished = new Set(
            hits.length
                ? db
                      .select({ gameId: wishlistItems.gameId })
                      .from(wishlistItems)
                      .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
                      .where(
                          and(
                              eq(wishlists.userId, c.get('user').id),
                              inArray(
                                  wishlistItems.gameId,
                                  hits.map((h) => h.id)
                              )
                          )
                      )
                      .all()
                      .map((r) => r.gameId)
                : []
        );
        const results: SearchResultDto[] = hits.map((h) => ({
            igdbId: h.id,
            name: h.name,
            year: h.year,
            coverImageId: h.coverImageId,
            igdbRating: h.rating,
            platforms: h.platforms,
            entryId: owned.get(h.id) ?? null,
            wishlisted: wished.has(h.id)
        }));
        return c.json({ results });
    });

    r.get('/platforms', async (c) => c.json({ platforms: await listPlatforms(db, igdb) }));

    return r;
}
