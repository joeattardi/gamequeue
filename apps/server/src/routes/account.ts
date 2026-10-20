import { Hono } from 'hono';
import {
    accountProfileSchema,
    changePasswordSchema,
    deleteAccountSchema,
    socialLinksSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { getCookie } from 'hono/cookie';
import { clearSessionCookie, requireAuth, type AuthVars } from '../auth/middleware.js';
import type { FailureLimiter } from '../auth/rate-limit.js';
import { SESSION_COOKIE } from '../auth/sessions.js';
import { HttpError } from '../errors.js';
import { validate } from '../http.js';
import {
    changePassword,
    deleteAccount,
    updateAccountProfile,
    updateSocialLinks
} from '../services/users.js';

export function accountRoutes({
    db,
    config,
    limiters
}: AppDeps & { limiters: { loginByAccount: FailureLimiter } }) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.patch('/', async (c) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        const input = validate(accountProfileSchema, raw);
        return c.json({ user: updateAccountProfile(db, c.get('user').id, input) });
    });

    r.put('/social', async (c) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        const input = validate(socialLinksSchema, raw);
        return c.json({ user: updateSocialLinks(db, c.get('user').id, input) });
    });

    r.put('/password', async (c) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        const input = validate(changePasswordSchema, raw);
        const userId = c.get('user').id;

        // A stolen session shouldn't be able to guess the password offline-style, so share the login limiter.
        const key = `password|${userId}`;
        const wait = limiters.loginByAccount.retryAfter(key);
        if (wait > 0) {
            c.header('Retry-After', String(wait));
            return c.json({ error: 'Too many attempts. Try again later.' }, 429);
        }
        const ok = await changePassword(
            db,
            userId,
            getCookie(c, SESSION_COOKIE),
            input.currentPassword,
            input.newPassword
        );
        if (!ok) {
            limiters.loginByAccount.fail(key);
            throw new HttpError(400, 'Invalid input', {
                details: [{ path: 'currentPassword', message: 'That is not your current password' }]
            });
        }
        limiters.loginByAccount.reset(key);
        return c.json({ ok: true });
    });

    r.delete('/', async (c) => {
        const raw: unknown = await c.req.json().catch(() => undefined);
        if (raw === undefined) throw new HttpError(400, 'Invalid request');
        const input = validate(deleteAccountSchema, raw);
        const userId = c.get('user').id;

        const key = `password|${userId}`;
        const wait = limiters.loginByAccount.retryAfter(key);
        if (wait > 0) {
            c.header('Retry-After', String(wait));
            return c.json({ error: 'Too many attempts. Try again later.' }, 429);
        }
        if (!(await deleteAccount(db, userId, input.password))) {
            limiters.loginByAccount.fail(key);
            throw new HttpError(400, 'Invalid input', {
                details: [{ path: 'password', message: 'That is not your password' }]
            });
        }
        limiters.loginByAccount.reset(key);
        clearSessionCookie(c, config);
        return c.json({ ok: true });
    });

    return r;
}
