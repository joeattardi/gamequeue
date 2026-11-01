import { Hono } from 'hono';
import {
    addWishlistItemSchema,
    moveWishlistItemSchema,
    pageQuerySchema,
    releasingSoonQuerySchema,
    patchWishlistItemSchema,
    reorderWishlistSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import { moveInList, reorderList } from '../services/lists.js';
import {
    addToWishlist,
    ensureWishlist,
    getWishlist,
    releasingSoon,
    patchWishlistItem,
    refreshWishlistReleases,
    removeFromWishlist
} from '../services/wishlist.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/**
 * The user's wishlist: a thin wrapper over their `wishlist`-kind list. The list routes
 * (`/api/lists/:id/...`) work on it too; these add what only a wishlist has (target platform, note,
 * release dates) and keep the wishlist's own response shape, so the web app needs no list id.
 * Several wishlists later would mean `/api/wishlists/:id/...` routes over the same services.
 */
export function wishlistRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    const wishlistId = (c: { get(k: 'user'): { id: number } }) => ensureWishlist(db, uid(c)).id;

    r.get('/', async (c) => {
        const page = validate(pageQuerySchema, c.req.query());
        await refreshWishlistReleases(db, igdb, wishlistId(c));
        return c.json({ wishlist: getWishlist(db, uid(c), page) });
    });
    // Home page: unreleased wishlisted games with an exact release day coming up
    r.get('/releasing-soon', (c) => {
        const q = validate(releasingSoonQuerySchema, c.req.query());
        return c.json({
            items: releasingSoon(
                db,
                wishlistId(c),
                q.today ?? new Date().toISOString().slice(0, 10),
                q.days
            )
        });
    });
    r.post('/items', async (c) =>
        c.json({
            wishlist: await addToWishlist(
                db,
                igdb,
                uid(c),
                validate(addWishlistItemSchema, await body(c))
            )
        })
    );
    r.patch('/items/:igdbId', async (c) =>
        c.json({
            wishlist: patchWishlistItem(
                db,
                uid(c),
                parseId(c.req.param('igdbId')),
                validate(patchWishlistItemSchema, await body(c))
            )
        })
    );
    r.delete('/items/:igdbId', (c) =>
        c.json({ wishlist: removeFromWishlist(db, uid(c), parseId(c.req.param('igdbId'))) })
    );
    r.put('/move', async (c) => {
        const { igdbId, toIndex } = validate(moveWishlistItemSchema, await body(c));
        moveInList(db, uid(c), wishlistId(c), igdbId, toIndex);
        return c.json({ wishlist: getWishlist(db, uid(c)) });
    });
    r.put('/order', async (c) => {
        reorderList(
            db,
            uid(c),
            wishlistId(c),
            validate(reorderWishlistSchema, await body(c)).igdbIds
        );
        return c.json({ wishlist: getWishlist(db, uid(c)) });
    });
    return r;
}
