import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { errorEvents, passwordResets, sessions, users } from '../src/db/schema.js';
import { resetPassword as adminResetPassword, updateUser } from '../src/services/admin-users.js';
import {
    RESET_COOLDOWN_MS,
    RESET_TTL_MS,
    requestPasswordReset,
    resetPassword
} from '../src/services/password-reset.js';
import { changePassword } from '../src/services/users.js';
import type { Mail } from '../src/services/mailer.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

function setup(failSend = false) {
    const sent: Mail[] = [];
    const mailer = async (m: Mail) => {
        if (failSend) throw new Error('Resend is down');
        sent.push(m);
    };
    const made = makeApp({}, undefined, undefined, undefined, mailer);
    const tokenOf = (mail: Mail | undefined) => /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    return { ...made, sent, tokenOf, mailer };
}

type App = ReturnType<typeof makeApp>['app'];
const post = (app: App, path: string, body: unknown) => app.request(`/api${path}`, json(body));
const login = (app: App, username: string, password: string) =>
    post(app, '/auth/login', { username, password });

describe('forgot password', () => {
    it('emails a one-hour link to the account and answers 200', async () => {
        const { app, db, sent, tokenOf } = setup();
        await register(app, 'a@example.com', undefined, 'alice');
        const res = await post(app, '/auth/forgot-password', { email: 'A@Example.com' });
        expect(res.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0]!.to).toBe('a@example.com');
        expect(sent[0]!.html).toContain('/reset-password?token=');
        expect(sent[0]!.text).toContain('alice');
        const row = db.select().from(passwordResets).get()!;
        expect(row.tokenHash).not.toBe(tokenOf(sent[0]));
        expect(row.expiresAt - row.createdAt).toBe(RESET_TTL_MS);
    });

    it('answers the same for an unknown address and sends nothing', async () => {
        const { app, db, sent } = setup();
        const res = await post(app, '/auth/forgot-password', { email: 'nobody@example.com' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(sent).toHaveLength(0);
        expect(db.select().from(passwordResets).all()).toHaveLength(0);
    });

    it('rejects a malformed address', async () => {
        const { app } = setup();
        expect((await post(app, '/auth/forgot-password', { email: 'nope' })).status).toBe(400);
    });

    it('ignores a second request inside the cooldown', async () => {
        const { app, sent } = setup();
        await register(app, 'a@example.com');
        await post(app, '/auth/forgot-password', { email: 'a@example.com' });
        const again = await post(app, '/auth/forgot-password', { email: 'a@example.com' });
        expect(again.status).toBe(200);
        expect(sent).toHaveLength(1);
    });

    it('allows another email after the cooldown but caps them per hour', async () => {
        const { app, db, config, sent, mailer } = setup();
        await register(app, 'a@example.com');
        const start = Date.now();
        for (let i = 0; i < 7; i++)
            await requestPasswordReset(
                db,
                config,
                mailer,
                'a@example.com',
                start + i * (RESET_COOLDOWN_MS + 1)
            );
        expect(sent).toHaveLength(5);
    });

    it('records a failed send for the admin log and still answers 200', async () => {
        const { app, db } = setup(true);
        await register(app, 'a@example.com');
        const res = await post(app, '/auth/forgot-password', { email: 'a@example.com' });
        expect(res.status).toBe(200);
        expect(
            db
                .select()
                .from(errorEvents)
                .all()
                .map((e) => e.kind)
        ).toContain('email_failed');
    });

    it("answers without waiting for the email provider, so timing doesn't reveal accounts", async () => {
        const never = () => new Promise<void>(() => {});
        const { app } = makeApp({}, undefined, undefined, undefined, never);
        await register(app, 'a@example.com');
        const res = await Promise.race([
            post(app, '/auth/forgot-password', { email: 'a@example.com' }),
            new Promise<'stuck'>((r) => setTimeout(() => r('stuck'), 500))
        ]);
        expect(res).not.toBe('stuck');
        expect((res as Response).status).toBe(200);
    });
});

describe('reset password', () => {
    async function requested() {
        const ctx = setup();
        await register(ctx.app, 'a@example.com', 'old password 123', 'alice');
        await post(ctx.app, '/auth/forgot-password', { email: 'a@example.com' });
        return { ...ctx, token: ctx.tokenOf(ctx.sent[0]) };
    }

    it('sets the new password, which then signs in; the old one no longer does', async () => {
        const { app, token } = await requested();
        const res = await post(app, '/auth/reset-password', {
            token,
            password: 'brand new pass 1'
        });
        expect(res.status).toBe(200);
        expect((await login(app, 'alice', 'brand new pass 1')).status).toBe(200);
        expect((await login(app, 'alice', 'old password 123')).status).toBe(401);
    });

    it('works once only', async () => {
        const { app, token } = await requested();
        await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' });
        const again = await post(app, '/auth/reset-password', {
            token,
            password: 'another pass 123'
        });
        expect(again.status).toBe(400);
        expect((await login(app, 'alice', 'brand new pass 1')).status).toBe(200);
    });

    it('rejects unknown and expired tokens', async () => {
        const { app, db, token } = await requested();
        expect(
            (
                await post(app, '/auth/reset-password', {
                    token: 'bogus',
                    password: 'brand new pass 1'
                })
            ).status
        ).toBe(400);
        db.update(passwordResets)
            .set({ expiresAt: Date.now() - 1 })
            .run();
        expect(
            (await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' }))
                .status
        ).toBe(400);
        expect((await login(app, 'alice', 'old password 123')).status).toBe(200);
    });

    it('enforces the password rules and keeps the token usable', async () => {
        const { app, token } = await requested();
        expect((await post(app, '/auth/reset-password', { token, password: 'short' })).status).toBe(
            400
        );
        expect(
            (await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' }))
                .status
        ).toBe(200);
    });

    it('signs the account out everywhere and voids its other links', async () => {
        const { app, db, sent, tokenOf } = await requested();
        const cookie = cookieFrom(await login(app, 'alice', 'old password 123'));
        expect((await app.request('/api/auth/me', { headers: { cookie } })).status).toBe(200);
        // A second link, issued after the cooldown
        db.update(passwordResets)
            .set({ createdAt: Date.now() - 2 * RESET_COOLDOWN_MS })
            .run();
        await post(app, '/auth/forgot-password', { email: 'a@example.com' });
        expect(sent).toHaveLength(2);
        await post(app, '/auth/reset-password', {
            token: tokenOf(sent[1]),
            password: 'brand new pass 1'
        });
        expect((await app.request('/api/auth/me', { headers: { cookie } })).status).toBe(401);
        expect(db.select().from(sessions).all()).toHaveLength(0);
        expect(db.select().from(passwordResets).all()).toHaveLength(0);
        expect(
            (
                await post(app, '/auth/reset-password', {
                    token: tokenOf(sent[0]),
                    password: 'x'.repeat(12)
                })
            ).status
        ).toBe(400);
    });

    it('confirms an unconfirmed address, since the link reached its inbox', async () => {
        const { db, token } = await requested();
        db.update(users).set({ emailVerifiedAt: null }).run();
        await resetPassword(db, token, 'brand new pass 1');
        expect(
            db.select().from(users).where(eq(users.username, 'alice')).get()!.emailVerifiedAt
        ).not.toBeNull();
    });

    async function sentLink() {
        const ctx = await requested();
        const id = ctx.db.select().from(users).where(eq(users.username, 'alice')).get()!.id;
        return { ...ctx, id };
    }

    it('voids pending links when the user changes their password', async () => {
        const { app, db, token, id } = await sentLink();
        expect(
            await changePassword(db, id, undefined, 'old password 123', 'changed pass 123')
        ).toBe(true);
        expect(
            (await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' }))
                .status
        ).toBe(400);
    });

    it('voids pending links when an admin resets the password', async () => {
        const { app, db, token, id } = await sentLink();
        await adminResetPassword(db, id, 'admin set pass 1');
        expect(
            (await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' }))
                .status
        ).toBe(400);
    });

    it('voids a link once the account no longer has the address it was sent to', async () => {
        const { app, db, token, id } = await sentLink();
        updateUser(db, id, {
            username: 'alice',
            email: 'new@example.com',
            role: 'gamer',
            firstName: '',
            lastName: '',
            showRealName: false,
            steam: '',
            xbox: '',
            playstation: '',
            discord: ''
        });
        expect(
            (await post(app, '/auth/reset-password', { token, password: 'brand new pass 1' }))
                .status
        ).toBe(400);
        expect((await login(app, 'alice', 'old password 123')).status).toBe(200);
    });
});
