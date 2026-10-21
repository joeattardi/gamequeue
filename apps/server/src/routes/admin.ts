import { Hono } from 'hono';
import {
    adminCreateUserSchema,
    adminResetPasswordSchema,
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
import { readDatabaseStats } from '../services/database-stats.js';
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

    // Database size, IGDB cache and per-table counts
    r.get('/database', (c) => c.json(readDatabaseStats(db, config)));

    // User management
    const body = async (c: { req: { json(): Promise<unknown> } }) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        return raw;
    };
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
