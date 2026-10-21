import { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { requireAdmin, requireAuth, type AuthVars } from '../auth/middleware.js';

/** Admin-only API. Every route here is behind `requireAuth` + `requireAdmin`. */
export function adminRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config), requireAdmin);
    // Placeholder until the admin tools (backup status etc.) exist
    r.get('/', (c) => c.json({ ok: true }));
    return r;
}
