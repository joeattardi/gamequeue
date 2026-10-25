import type { UserRole } from '@gamequeue/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { resolveSession, SESSION_COOKIE, SESSION_TTL_MS } from './sessions.js';

export type AuthVars = {
    user: {
        id: number;
        username: string;
        email: string;
        role: UserRole;
        emailVerified: boolean;
    };
};

export function cookieOptions(config: Config, expiresAt: number) {
    return {
        httpOnly: true,
        sameSite: 'Lax' as const,
        secure: config.secureCookies,
        path: '/',
        expires: new Date(expiresAt),
        maxAge: (Math.min(SESSION_TTL_MS, Math.max(0, expiresAt - Date.now())) / 1000) | 0
    };
}

export const setSessionCookie = (c: Context, config: Config, token: string, expiresAt: number) =>
    setCookie(c, SESSION_COOKIE, token, cookieOptions(config, expiresAt));

export const clearSessionCookie = (c: Context, config: Config) =>
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: config.secureCookies });

/**
 * 401 without a session. When email verification is on, 403 `email_unverified` for a signed-in user
 * who hasn't confirmed their address: that is the "wall", so only routes that pass `allowUnverified`
 * (the verification endpoints, `/auth/me`, deleting the account) are open to them.
 */
export function requireAuth(
    db: Db,
    config: Config,
    opts: { allowUnverified?: boolean } = {}
): MiddlewareHandler<{ Variables: AuthVars }> {
    const walled = (user: AuthVars['user']) =>
        config.emailVerification && !user.emailVerified && !opts.allowUnverified;
    const refuse = (c: Context) =>
        c.json({ error: 'Confirm your email address first', code: 'email_unverified' }, 403);
    return async (c, next) => {
        // Several routers share the /api/entries prefix; authenticate once per request
        const known = c.get('user');
        if (known) return walled(known) ? refuse(c) : next();
        const token = getCookie(c, SESSION_COOKIE);
        const session = token ? resolveSession(db, token) : undefined;
        if (!token || !session) {
            if (token) clearSessionCookie(c, config);
            return c.json({ error: 'Not authenticated' }, 401);
        }
        if (session.renewed) setSessionCookie(c, config, token, session.expiresAt);
        c.set('user', session.user);
        if (walled(session.user)) return refuse(c);
        await next();
    };
}

/**
 * Use after `requireAuth` on admin-only routers: 403 unless the user has the `admin` role. The role
 * comes from the database on every request (`resolveSession` joins `users`), so granting or revoking
 * it takes effect immediately, without a new login.
 */
export const requireAdmin: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
    if (c.get('user').role !== 'admin') return c.json({ error: 'Admin access required' }, 403);
    await next();
};
