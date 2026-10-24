import { Hono } from 'hono';
import { timelineQuerySchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { validate } from '../http.js';
import { getTimeline } from '../services/activity.js';
import { getStats } from '../services/stats.js';

export function statsRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    r.get('/', (c) => c.json({ stats: getStats(db, c.get('user').id) }));
    r.get('/timeline', (c) =>
        c.json({
            timeline: getTimeline(
                db,
                c.get('user').id,
                validate(timelineQuerySchema, c.req.query())
            )
        })
    );
    return r;
}
