import { Hono } from 'hono';
import { accountProfileSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { validate } from '../http.js';
import { updateAccountProfile } from '../services/users.js';

export function accountRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.patch('/', async (c) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        const input = validate(accountProfileSchema, raw);
        return c.json({ user: updateAccountProfile(db, c.get('user').id, input) });
    });

    return r;
}
