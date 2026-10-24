import { Hono } from 'hono';
import {
    isFinishedYear,
    pageQuerySchema,
    PROFILE_VIEWS,
    usernameSchema,
    type ProfileView
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import { parseId, validate } from '../http.js';
import {
    getProfile,
    getProfileActivity,
    getProfileGame,
    getProfileList,
    getProfileSmartList,
    getProfileGames,
    getProfileRecap,
    getProfileStats,
    getProfileWishlist
} from '../services/profile.js';
import { getPublicGrid } from '../services/grids.js';
import { getPublicTierList } from '../services/tier-lists.js';
import { getAvatarByUsername } from '../services/avatars.js';
import { parseRecapYear } from '../services/recap.js';

/** Public: deliberately has no requireAuth. */
export function profileRoutes({ db }: AppDeps) {
    const r = new Hono();
    const parseUsername = (raw: string) => {
        const username = usernameSchema.safeParse(raw);
        if (!username.success) throw new HttpError(404, 'Not found');
        return username.data;
    };
    r.get('/:username', (c) =>
        c.json({ profile: getProfile(db, parseUsername(c.req.param('username'))) })
    );
    // Registered before "/:username/:view" so "wishlist" isn't read as a view
    r.get('/:username/wishlist', (c) =>
        c.json({
            wishlist: getProfileWishlist(
                db,
                parseUsername(c.req.param('username')),
                validate(pageQuerySchema, c.req.query())
            )
        })
    );
    r.get('/:username/activity', (c) =>
        c.json({
            activity: getProfileActivity(
                db,
                parseUsername(c.req.param('username')),
                validate(pageQuerySchema, c.req.query())
            )
        })
    );
    r.get('/:username/games/:igdbId', (c) =>
        c.json(
            getProfileGame(
                db,
                parseUsername(c.req.param('username')),
                parseId(c.req.param('igdbId'))
            )
        )
    );
    r.get('/:username/lists/:id', (c) =>
        c.json(
            getProfileList(
                db,
                parseUsername(c.req.param('username')),
                parseId(c.req.param('id')),
                validate(pageQuerySchema, c.req.query())
            )
        )
    );
    r.get('/:username/smart-lists/:id', (c) =>
        c.json(
            getProfileSmartList(
                db,
                parseUsername(c.req.param('username')),
                parseId(c.req.param('id')),
                validate(pageQuerySchema, c.req.query())
            )
        )
    );
    r.get('/:username/grids/:id', (c) =>
        c.json({
            grid: getPublicGrid(
                db,
                parseUsername(c.req.param('username')),
                parseId(c.req.param('id'))
            )
        })
    );
    r.get('/:username/tier-lists/:id', (c) =>
        c.json({
            tierList: getPublicTierList(
                db,
                parseUsername(c.req.param('username')),
                parseId(c.req.param('id'))
            )
        })
    );
    r.get('/:username/avatar', (c) => {
        const avatar = getAvatarByUsername(db, parseUsername(c.req.param('username')));
        if (!avatar) throw new HttpError(404, 'Not found');
        // The web client adds ?v=<updatedAt>, so a changed avatar is a new URL and may be cached hard.
        return c.body(new Uint8Array(avatar.data), 200, {
            'content-type': avatar.contentType,
            'cache-control': 'public, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff'
        });
    });
    r.get('/:username/stats', (c) =>
        c.json({ stats: getProfileStats(db, parseUsername(c.req.param('username'))) })
    );
    r.get('/:username/recap', (c) =>
        c.json({
            recap: getProfileRecap(
                db,
                parseUsername(c.req.param('username')),
                parseRecapYear(c.req.query('year'))
            )
        })
    );
    r.get('/:username/:view', (c) => {
        const view = c.req.param('view') as ProfileView;
        if (!PROFILE_VIEWS.includes(view)) throw new HttpError(404, 'Not found');
        return c.json({
            games: getProfileGames(
                db,
                parseUsername(c.req.param('username')),
                view,
                validate(pageQuerySchema, c.req.query())
            )
        });
    });
    r.get('/:username/finished/:year', (c) => {
        const year = c.req.param('year');
        if (!isFinishedYear(year)) throw new HttpError(404, 'Not found');
        return c.json({
            games: getProfileGames(
                db,
                parseUsername(c.req.param('username')),
                'finished',
                validate(pageQuerySchema, c.req.query()),
                year
            )
        });
    });
    return r;
}
