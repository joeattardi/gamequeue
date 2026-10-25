import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import {
    DEFAULT_SLOT_NAMES,
    changeEmailSchema,
    forgotPasswordSchema,
    loginSchema,
    registerSchema,
    resetPasswordSchema,
    verifyEmailSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import {
    clearSessionCookie,
    requireAuth,
    setSessionCookie,
    type AuthVars
} from '../auth/middleware.js';
import { clientIp } from '../auth/client-ip.js';
import { dummyHash, hashPassword, verifyPassword } from '../auth/password.js';
import type { FailureLimiter } from '../auth/rate-limit.js';
import { createSession, destroySession, SESSION_COOKIE } from '../auth/sessions.js';
import {
    assertCanResend,
    changeUnverifiedEmail,
    sendVerification,
    verifyEmail
} from '../services/email-verification.js';
import {
    requestPasswordReset,
    resetPassword,
    sendPasswordChangedNotice
} from '../services/password-reset.js';
import type { Mailer } from '../services/mailer.js';
import type { Notify } from '../services/notify.js';
import { signupsEnabled } from '../services/settings.js';
import { getUserDto } from '../services/users.js';
import { slots, users } from '../db/schema.js';

type Deps = Pick<AppDeps, 'db' | 'config'> &
    Required<Pick<AppDeps, 'limiters'>> & { notify: Notify; mailer?: Mailer };

async function parseBody<T>(
    c: Context,
    schema: {
        safeParse(
            v: unknown
        ):
            | { success: true; data: T }
            | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
    }
) {
    const raw = await c.req.json().catch(() => undefined);
    const result = schema.safeParse(raw);
    if (result.success) return { data: result.data };
    return {
        response: c.json(
            {
                error: 'Invalid input',
                details: result.error.issues.map((i) => ({
                    path: i.path.join('.'),
                    message: i.message
                }))
            },
            400
        )
    };
}

export function authRoutes({ db, config, limiters, notify, mailer }: Deps) {
    const r = new Hono<{ Variables: AuthVars }>();

    // Without an email provider a reset link can't reach anyone; development prints it instead
    const passwordReset = Boolean(mailer) || !config.production;

    // Public: lets the login page hide the "Create an account" and "Forgot your password?" links.
    r.get('/config', (c) => c.json({ signupsEnabled: signupsEnabled(db, config), passwordReset }));

    const unverifiedOk = requireAuth(db, config, { allowUnverified: true });

    // Username only: no personal data goes to the email provider
    const notifySignup = (username: string) =>
        notify('New GameQueue signup', `${username} just created an account.`);

    r.post('/register', async (c) => {
        if (!signupsEnabled(db, config)) return c.json({ error: 'Signups are disabled' }, 403);
        const body = await parseBody(c, registerSchema);
        if (body.response) return body.response;
        const { username, email, password } = body.data;

        const passwordHash = await hashPassword(password);
        // The unique index is the source of truth; no check-then-insert race.
        let user: { id: number; username: string; email: string } | undefined;
        try {
            user = db.transaction((tx) => {
                const u = tx
                    .insert(users)
                    .values({
                        username,
                        email,
                        passwordHash,
                        // Without email verification (no Resend sender configured) nobody could ever confirm
                        emailVerifiedAt: config.emailVerification ? null : Date.now()
                    })
                    .returning({ id: users.id, username: users.username, email: users.email })
                    .get();
                tx.insert(slots)
                    .values(
                        DEFAULT_SLOT_NAMES.map((name, position) => ({
                            userId: u.id,
                            name,
                            position
                        }))
                    )
                    .run();
                return u;
            });
        } catch (e) {
            if (e instanceof Error && /UNIQUE/.test(e.message)) {
                // Named on purpose: telling people their address is already registered beats a vague
                // error, at the price of letting anyone check whether an address has an account
                const emailTaken = db
                    .select({ id: users.id })
                    .from(users)
                    .where(eq(users.email, email))
                    .get();
                const field = emailTaken ? 'email' : 'username';
                const message = emailTaken
                    ? 'That email is already registered. Try signing in instead.'
                    : 'That username is taken';
                return c.json({ error: message, details: [{ path: field, message }] }, 409);
            }
            throw e;
        }
        if (config.emailVerification) await sendVerification(db, config, mailer, user);
        // Without verification the account is usable now; with it, the owner hears once it's confirmed
        else notifySignup(user.username);
        const { token, expiresAt } = createSession(db, user.id);
        setSessionCookie(c, config, token, expiresAt);
        return c.json({ user: getUserDto(db, user.id) }, 201);
    });

    r.post('/login', async (c) => {
        const body = await parseBody(c, loginSchema);
        if (body.response) return body.response;
        const { username, password } = body.data;

        const ip = clientIp(c, config.trustProxy);
        const keys: [FailureLimiter, string][] = [
            [limiters.loginByAccount, `${username}|${ip}`],
            [limiters.loginByIp, ip]
        ];
        const wait = Math.max(...keys.map(([l, k]) => l.retryAfter(k)));
        if (wait > 0) {
            c.header('Retry-After', String(wait));
            return c.json({ error: 'Too many attempts. Try again later.' }, 429);
        }

        const row = db.select().from(users).where(eq(users.username, username)).get();
        // Always run a verify so response time doesn't reveal whether the username exists.
        const ok = await verifyPassword(row?.passwordHash ?? (await dummyHash()), password);
        if (!row || !ok) {
            for (const [l, k] of keys) l.fail(k);
            return c.json({ error: 'Invalid username or password' }, 401);
        }
        limiters.loginByAccount.reset(keys[0]![1]);
        const { token, expiresAt } = createSession(db, row.id);
        setSessionCookie(c, config, token, expiresAt);
        return c.json({ user: getUserDto(db, row.id) });
    });

    r.post('/logout', (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token) destroySession(db, token);
        clearSessionCookie(c, config);
        return c.json({ ok: true });
    });

    r.get('/me', unverifiedOk, (c) => c.json({ user: getUserDto(db, c.get('user').id) }));

    // Public: the emailed link works in any browser, signed in or not. A POST so that mail scanners
    // and link previews that fetch URLs can't use up the token.
    r.post('/verify-email', async (c) => {
        const body = await parseBody(c, verifyEmailSchema);
        if (body.response) return body.response;
        const userId = verifyEmail(db, body.data.token);
        if (userId === undefined)
            return c.json({ error: 'This link is invalid or has expired' }, 400);
        const row = db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, userId))
            .get();
        if (row) notifySignup(row.username);
        return c.json({ ok: true });
    });

    r.post('/resend-verification', unverifiedOk, async (c) => {
        const { id } = c.get('user');
        const user = getUserDto(db, id);
        if (user.emailVerified) return c.json({ ok: true });
        assertCanResend(db, id);
        if (!(await sendVerification(db, config, mailer, user)))
            return c.json({ error: "We couldn't send the email. Try again in a moment." }, 502);
        return c.json({ ok: true });
    });

    // A typo in the address at signup: fixing it sends a new link there. Confirmed addresses can't change.
    r.put('/email', unverifiedOk, async (c) => {
        const body = await parseBody(c, changeEmailSchema);
        if (body.response) return body.response;
        const { id } = c.get('user');
        if (getUserDto(db, id).emailVerified)
            return c.json({ error: 'Your email address is already confirmed' }, 409);
        assertCanResend(db, id);
        changeUnverifiedEmail(db, id, body.data.email);
        const user = getUserDto(db, id);
        if (!(await sendVerification(db, config, mailer, user)))
            return c.json({ error: "We couldn't send the email. Try again in a moment." }, 502);
        return c.json({ user });
    });

    // Public. Answers the same whether or not the address has an account, so it can't be used to
    // look addresses up (unlike signup, which names a taken address on purpose).
    r.post('/forgot-password', async (c) => {
        if (!passwordReset)
            return c.json(
                { error: "Password reset isn't set up on this server. Ask its admin to reset it." },
                503
            );
        const body = await parseBody(c, forgotPasswordSchema);
        if (body.response) return body.response;
        await requestPasswordReset(db, config, mailer, body.data.email);
        return c.json({ ok: true });
    });

    r.post('/reset-password', async (c) => {
        const body = await parseBody(c, resetPasswordSchema);
        if (body.response) return body.response;
        const userId = await resetPassword(db, body.data.token, body.data.password);
        if (userId === undefined)
            return c.json({ error: 'This link is invalid or has expired' }, 400);
        sendPasswordChangedNotice(db, config, mailer, userId, 'reset');
        return c.json({ ok: true });
    });

    return r;
}
