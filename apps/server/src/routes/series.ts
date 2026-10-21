import { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId } from '../http.js';
import { getSeries, queueSeries } from '../services/series.js';

/** IGDB series: the games of one, and which of them the user has. */
export function seriesRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;

    r.get('/:id', async (c) =>
        c.json({ series: await getSeries(db, igdb, uid(c), parseId(c.req.param('id'))) })
    );
    r.post('/:id/queue', async (c) =>
        c.json(await queueSeries(db, igdb, uid(c), parseId(c.req.param('id'))))
    );

    return r;
}
