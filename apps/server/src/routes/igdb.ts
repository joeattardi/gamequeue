import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { searchQuerySchema, type GameDetailDto, type SearchResultDto } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { entries, wishlistItems, wishlists } from '../db/schema.js';
import { parseId, validate } from '../http.js';
import { TtlCache } from '../igdb/search-cache.js';
import type { IgdbSearchHit } from '../igdb/types.js';
import { HttpError } from '../errors.js';
import {
    callIgdb,
    ensureGame,
    ensureScreenshots,
    listPlatforms,
    loadGames,
    requireIgdb
} from '../services/games.js';
import { gameOffers, offersCache } from '../services/prices.js';
import { similarCache, similarGames } from '../services/similar.js';

export function igdbRoutes({ db, config, igdb, itad }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    const cache = new TtlCache<IgdbSearchHit[]>();
    const offers = offersCache();
    const similar = similarCache();
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

    // Every shop's current price for a cached game (the detail page loads this separately, so a
    // slow or failing ITAD never holds up the page)
    r.get('/games/:igdbId/prices', async (c) => {
        const igdbId = Number(c.req.param('igdbId'));
        if (!Number.isInteger(igdbId) || igdbId <= 0) throw new HttpError(400, 'Invalid game id');
        await ensureGame(db, igdb, igdbId);
        return c.json(await gameOffers(db, itad, offers, igdbId));
    });

    // IGDB's "similar games" for a game, loaded separately like prices so the page never waits on it
    r.get('/games/:igdbId/similar', async (c) => {
        const igdbId = parseId(c.req.param('igdbId'));
        return c.json({ games: await similarGames(db, igdb, similar, c.get('user').id, igdbId) });
    });

    // One game by IGDB id, for the detail page. IGDB is only called if we have never cached it.
    r.get('/games/:igdbId', async (c) => {
        const igdbId = Number(c.req.param('igdbId'));
        if (!Number.isInteger(igdbId) || igdbId <= 0) throw new HttpError(400, 'Invalid game id');
        const userId = c.get('user').id;
        await ensureGame(db, igdb, igdbId);
        await ensureScreenshots(db, igdb, igdbId);
        const game = loadGames(db, [igdbId]).get(igdbId)!;
        const entry = db
            .select({ id: entries.id })
            .from(entries)
            .where(and(eq(entries.userId, userId), eq(entries.gameId, igdbId)))
            .get();
        const wished = db
            .select({ gameId: wishlistItems.gameId })
            .from(wishlistItems)
            .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
            .where(and(eq(wishlists.userId, userId), eq(wishlistItems.gameId, igdbId)))
            .get();
        const detail: GameDetailDto = {
            game,
            entryId: entry?.id ?? null,
            wishlisted: wished !== undefined
        };
        return c.json(detail);
    });

    r.get('/platforms', async (c) => c.json({ platforms: await listPlatforms(db, igdb) }));

    return r;
}
