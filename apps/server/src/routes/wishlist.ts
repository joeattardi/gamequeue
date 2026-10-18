import { Hono } from 'hono';
import {
    addWishlistItemSchema,
    patchWishlistItemSchema,
    reorderWishlistSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    addToWishlist,
    ensureWishlist,
    getWishlist,
    patchWishlistItem,
    removeFromWishlist,
    reorderWishlist
} from '../services/wishlist.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/**
 * The user's wishlist. There is one today; the services all take a wishlist id, so supporting
 * several later means adding `/api/wishlists/:id/...` routes over the same functions.
 */
export function wishlistRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    const wishlistId = (c: { get(k: 'user'): { id: number } }) => ensureWishlist(db, uid(c)).id;

    r.get('/', (c) => c.json({ wishlist: getWishlist(db, uid(c), wishlistId(c)) }));
    r.post('/items', async (c) =>
        c.json({
            wishlist: await addToWishlist(
                db,
                igdb,
                uid(c),
                wishlistId(c),
                validate(addWishlistItemSchema, await body(c))
            )
        })
    );
    r.patch('/items/:igdbId', async (c) =>
        c.json({
            wishlist: patchWishlistItem(
                db,
                uid(c),
                wishlistId(c),
                parseId(c.req.param('igdbId')),
                validate(patchWishlistItemSchema, await body(c))
            )
        })
    );
    r.delete('/items/:igdbId', (c) =>
        c.json({
            wishlist: removeFromWishlist(db, uid(c), wishlistId(c), parseId(c.req.param('igdbId')))
        })
    );
    r.put('/order', async (c) =>
        c.json({
            wishlist: reorderWishlist(
                db,
                uid(c),
                wishlistId(c),
                validate(reorderWishlistSchema, await body(c)).igdbIds
            )
        })
    );
    return r;
}
