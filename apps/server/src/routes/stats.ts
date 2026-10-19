import { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { getStats } from '../services/stats.js';

export function statsRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    r.get('/', (c) => c.json({ stats: getStats(db, c.get('user').id) }));
    return r;
}
