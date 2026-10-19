import { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { getRecap, parseRecapYear } from '../services/recap.js';

export function recapRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    r.get('/', (c) =>
        c.json({ recap: getRecap(db, c.get('user').id, parseRecapYear(c.req.query('year'))) })
    );
    return r;
}
