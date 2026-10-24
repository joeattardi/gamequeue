import { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId } from '../http.js';
import type { TtlCache } from '../igdb/search-cache.js';
import type { IgdbSearchHit } from '../igdb/types.js';
import { discover, dismissGame, restoreGame } from '../services/discover.js';

/** Suggestions from the games you love, and the games you told it to stop suggesting. */
export function discoverRoutes({ db, config, igdb }: AppDeps, similar: TtlCache<IgdbSearchHit[]>) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.get('/', async (c) => c.json(await discover(db, igdb, similar, c.get('user').id)));
    r.put('/dismissed/:igdbId', (c) => {
        dismissGame(db, c.get('user').id, parseId(c.req.param('igdbId')));
        return c.json({ ok: true });
    });
    r.delete('/dismissed/:igdbId', (c) => {
        restoreGame(db, c.get('user').id, parseId(c.req.param('igdbId')));
        return c.json({ ok: true });
    });

    return r;
}
