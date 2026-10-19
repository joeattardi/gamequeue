import { Hono } from 'hono';
import { isFinishedYear, PROFILE_VIEWS, usernameSchema, type ProfileView } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import { getProfileStats } from '../services/profile.js';
import { getProfile, getProfileGames, getProfileWishlist } from '../services/profile.js';

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
        c.json({ wishlist: getProfileWishlist(db, parseUsername(c.req.param('username'))) })
    );
    r.get('/:username/stats', (c) =>
        c.json({ stats: getProfileStats(db, parseUsername(c.req.param('username'))) })
    );
    r.get('/:username/:view', (c) => {
        const view = c.req.param('view') as ProfileView;
        if (!PROFILE_VIEWS.includes(view)) throw new HttpError(404, 'Not found');
        return c.json({ games: getProfileGames(db, parseUsername(c.req.param('username')), view) });
    });
    r.get('/:username/finished/:year', (c) => {
        const year = c.req.param('year');
        if (!isFinishedYear(year)) throw new HttpError(404, 'Not found');
        return c.json({
            games: getProfileGames(db, parseUsername(c.req.param('username')), 'finished', year)
        });
    });
    return r;
}
