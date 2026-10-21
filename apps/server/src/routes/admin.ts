import { Hono } from 'hono';
import { readBackupReport } from '../services/backup-status.js';
import type { AppDeps } from '../app.js';
import { requireAdmin, requireAuth, type AuthVars } from '../auth/middleware.js';

/** Admin-only API. Every route here is behind `requireAuth` + `requireAdmin`. */
export function adminRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config), requireAdmin);
    // Cheap check that the caller may use the admin area at all
    r.get('/', (c) => c.json({ ok: true }));
    // What the nightly backup script last reported (see scripts/backup.sh)
    r.get('/backup', (c) => c.json(readBackupReport(config)));
    return r;
}
