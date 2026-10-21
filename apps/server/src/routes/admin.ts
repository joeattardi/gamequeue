import { Hono } from 'hono';
import {
    adminCreateUserSchema,
    adminResetPasswordSchema,
    adminSettingsSchema,
    type IgdbStatusDto,
    adminUpdateUserSchema
} from '@gamequeue/shared';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE } from '../auth/sessions.js';
import { HttpError } from '../errors.js';
import { parseId, validate } from '../http.js';
import {
    createUser,
    deleteUser,
    getUser,
    listUsers,
    resetPassword,
    updateUser
} from '../services/admin-users.js';
import { max } from 'drizzle-orm';
import { games } from '../db/schema.js';
import { purgeExpiredSessionsNow, purgeUnusedGames, vacuum } from '../services/maintenance.js';
import { readServerInfo } from '../services/server-info.js';
import { getAdminSettings, updateAdminSettings } from '../services/settings.js';
import { readDatabaseStats } from '../services/database-stats.js';
import { readBackupReport } from '../services/backup-status.js';
import type { AppDeps } from '../app.js';
import { requireAdmin, requireAuth, type AuthVars } from '../auth/middleware.js';

/** Admin-only API. Every route here is behind `requireAuth` + `requireAdmin`. */
export function adminRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config), requireAdmin);
    // Cheap check that the caller may use the admin area at all
    r.get('/', (c) => c.json({ ok: true }));
    // What the nightly backup script last reported (see scripts/backup.sh)
    r.get('/backup', (c) => c.json(readBackupReport(config)));

    // Database size, IGDB cache and per-table counts
    r.get('/database', (c) => c.json(readDatabaseStats(db, config)));

    const body = async (c: { req: { json(): Promise<unknown> } }) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        return raw;
    };

    // Cache and file housekeeping; each returns what it did so the page can say so
    r.post('/maintenance/purge-games', (c) => c.json(purgeUnusedGames(db)));
    r.post('/maintenance/purge-sessions', (c) => c.json(purgeExpiredSessionsNow(db)));
    r.post('/maintenance/vacuum', (c) => c.json(vacuum(db, config)));

    // Process, configuration (no secrets) and free disk space
    r.get('/server', (c) => c.json(readServerInfo(config)));

    // Runtime settings
    r.get('/settings', (c) => c.json(getAdminSettings(db, config)));
    r.put('/settings', async (c) => {
        const input = validate(adminSettingsSchema, await body(c));
        return c.json(updateAdminSettings(db, config, input));
    });

    // IGDB client counters and a live connectivity check
    r.get('/igdb', (c) => {
        const lastReleaseCheckAt =
            db
                .select({ at: max(games.releaseCheckedAt) })
                .from(games)
                .get()?.at ?? null;
        const live = igdb?.status?.();
        const status: IgdbStatusDto = {
            configured: !!igdb,
            tracked: !!live,
            since: live?.since ?? 0,
            token: live?.token ?? { valid: false, expiresAt: null },
            requests24h: live?.requests24h ?? { total: 0, failed: 0 },
            lastSuccessAt: live?.lastSuccessAt ?? null,
            lastError: live?.lastError ?? null,
            lastReleaseCheckAt
        };
        return c.json(status);
    });
    r.post('/igdb/ping', async (c) => {
        if (!igdb?.ping) throw new HttpError(409, 'IGDB is not configured');
        return c.json(await igdb.ping());
    });

    // User management
    r.get('/users', (c) => c.json({ users: listUsers(db) }));
    r.get('/users/:id', (c) => c.json({ user: getUser(db, parseId(c.req.param('id'))) }));
    r.post('/users', async (c) => {
        const input = validate(adminCreateUserSchema, await body(c));
        return c.json({ user: await createUser(db, input) }, 201);
    });
    r.patch('/users/:id', async (c) => {
        const input = validate(adminUpdateUserSchema, await body(c));
        return c.json({ user: updateUser(db, parseId(c.req.param('id')), input) });
    });
    r.put('/users/:id/password', async (c) => {
        const { password } = validate(adminResetPasswordSchema, await body(c));
        const id = parseId(c.req.param('id'));
        const mine = id === c.get('user').id;
        await resetPassword(db, id, password, mine ? getCookie(c, SESSION_COOKIE) : undefined);
        return c.json({ ok: true });
    });
    r.delete('/users/:id', (c) => {
        deleteUser(db, parseId(c.req.param('id')), c.get('user').id);
        return c.json({ ok: true });
    });
    return r;
}
