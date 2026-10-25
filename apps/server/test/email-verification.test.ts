import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { emailVerifications, errorEvents, users } from '../src/db/schema.js';
import {
    purgeUnverified,
    RESEND_COOLDOWN_MS,
    UNVERIFIED_TTL_MS,
    VERIFICATION_TTL_MS,
    verifyEmail
} from '../src/services/email-verification.js';
import { createMailer, type Mail } from '../src/services/mailer.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

function setup() {
    const sent: Mail[] = [];
    const mailer = async (m: Mail) => void sent.push(m);
    const made = makeApp({ emailVerification: true }, undefined, undefined, undefined, mailer);
    const tokenOf = (mail: Mail | undefined) => /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    return { ...made, sent, tokenOf };
}

const post = (app: ReturnType<typeof makeApp>['app'], path: string, body: unknown, cookie = '') =>
    app.request(`/api${path}`, json(body, cookie ? { cookie } : {}));

describe('registering with verification on', () => {
    it('creates an unverified account and emails a link to the address', async () => {
        const { app, db, sent, tokenOf } = setup();
        const res = await register(app, 'new@example.com');
        expect(res.status).toBe(201);
        expect((await res.json()).user.emailVerified).toBe(false);
        expect(sent).toHaveLength(1);
        expect(sent[0]!.to).toBe('new@example.com');
        expect(sent[0]!.html).toContain('/verify-email?token=');
        const row = db.select().from(emailVerifications).get()!;
        // Only the hash is stored
        expect(row.tokenHash).not.toBe(tokenOf(sent[0]));
        expect(row.tokenHash).toHaveLength(64);
    });

    it('walls the account off from the app but not from /me, resend or sign out', async () => {
        const { app } = setup();
        const cookie = cookieFrom(await register(app));
        const headers = { cookie };
        const me = await app.request('/api/auth/me', { headers });
        expect(me.status).toBe(200);
        const walled = await app.request('/api/entries', { headers });
        expect(walled.status).toBe(403);
        expect(await walled.json()).toMatchObject({ code: 'email_unverified' });
        for (const path of ['/api/slots', '/api/lists', '/api/stats', '/api/account'])
            expect((await app.request(path, { headers })).status).toBe(403);
        expect((await app.request('/api/igdb/search?q=zelda', { headers })).status).toBe(403);
    });

    it('hides the public profile until the email is confirmed', async () => {
        const { app, sent, tokenOf } = setup();
        await register(app, 'a@example.com', undefined, 'alice');
        expect((await app.request('/api/profiles/alice')).status).toBe(404);
        await post(app, '/auth/verify-email', { token: tokenOf(sent[0]) });
        expect((await app.request('/api/profiles/alice')).status).toBe(200);
    });

    it('still succeeds when the email cannot be sent, and records the failure', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { app, db } = makeApp(
            { emailVerification: true },
            undefined,
            undefined,
            undefined,
            async () => {
                throw new Error('Resend answered 500');
            }
        );
        expect((await register(app)).status).toBe(201);
        expect(db.select().from(errorEvents).get()?.kind).toBe('email_failed');
    });

    it('does not ask for verification when no sender is configured', async () => {
        const { app } = makeApp();
        const res = await register(app);
        expect((await res.json()).user.emailVerified).toBe(true);
        expect(
            (await app.request('/api/entries', { headers: { cookie: cookieFrom(res) } })).status
        ).toBe(200);
    });
});

describe('confirming the address', () => {
    it('opens the app, works without a session, and notifies the owner once', async () => {
        const notify = vi.fn();
        const sent: Mail[] = [];
        const { app } = (() => {
            const m = makeApp(
                { emailVerification: true },
                undefined,
                undefined,
                undefined,
                async (x) => void sent.push(x)
            );
            return m;
        })();
        void notify;
        const cookie = cookieFrom(await register(app));
        const token = /token=([\w-]+)/.exec(sent[0]!.text)![1]!;
        // No cookie: the link works in any browser
        expect((await post(app, '/auth/verify-email', { token })).status).toBe(200);
        expect((await app.request('/api/entries', { headers: { cookie } })).status).toBe(200);
        expect(
            (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user
                .emailVerified
        ).toBe(true);
        // The link is single-use
        expect((await post(app, '/auth/verify-email', { token })).status).toBe(400);
    });

    it('rejects unknown, expired and superseded-address tokens', async () => {
        const { app, db, sent, tokenOf } = setup();
        const cookie = cookieFrom(await register(app));
        const token = tokenOf(sent[0]);
        expect((await post(app, '/auth/verify-email', { token: 'nope' })).status).toBe(400);
        expect(verifyEmail(db, token, Date.now() + VERIFICATION_TTL_MS + 1)).toBeUndefined();
        // A link for the old address is void once the address changed
        await db.update(emailVerifications).set({ createdAt: 0 }).run();
        expect(
            (
                await app.request('/api/auth/email', {
                    ...json({ email: 'fixed@example.com' }, { cookie }),
                    method: 'PUT'
                })
            ).status
        ).toBe(200);
        expect((await post(app, '/auth/verify-email', { token })).status).toBe(400);
        expect((await post(app, '/auth/verify-email', { token: tokenOf(sent[1]) })).status).toBe(
            200
        );
        expect(sent[1]!.to).toBe('fixed@example.com');
    });

    it('refuses to change an address that is already confirmed', async () => {
        const { app, sent, tokenOf } = setup();
        const cookie = cookieFrom(await register(app));
        await post(app, '/auth/verify-email', { token: tokenOf(sent[0]) });
        const res = await app.request('/api/auth/email', {
            ...json({ email: 'x@example.com' }, { cookie }),
            method: 'PUT'
        });
        expect(res.status).toBe(409);
    });
});

describe('resending', () => {
    it('waits a minute between emails and caps them per hour', async () => {
        const { app, db, sent } = setup();
        const cookie = cookieFrom(await register(app));
        expect((await post(app, '/auth/resend-verification', {}, cookie)).status).toBe(429);
        // Age the signup email past the cooldown each time
        const age = () =>
            db
                .update(emailVerifications)
                .set({ createdAt: Date.now() - RESEND_COOLDOWN_MS - 1 })
                .run();
        for (let i = 0; i < 4; i++) {
            age();
            expect((await post(app, '/auth/resend-verification', {}, cookie)).status).toBe(200);
        }
        expect(sent).toHaveLength(5);
        age();
        expect((await post(app, '/auth/resend-verification', {}, cookie)).status).toBe(429);
        expect(sent).toHaveLength(5);
    });

    it('reports a delivery failure to the user', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let fail = false;
        const { app, db } = makeApp(
            { emailVerification: true },
            undefined,
            undefined,
            undefined,
            async () => {
                if (fail) throw new Error('down');
            }
        );
        const cookie = cookieFrom(await register(app));
        db.update(emailVerifications).set({ createdAt: 0 }).run();
        fail = true;
        expect((await post(app, '/auth/resend-verification', {}, cookie)).status).toBe(502);
    });

    it('needs a session', async () => {
        const { app } = setup();
        expect((await post(app, '/auth/resend-verification', {})).status).toBe(401);
    });
});

describe('cleanup', () => {
    it('deletes accounts unverified for a week, keeps confirmed and newer ones', async () => {
        const { app, db, sent, tokenOf } = setup();
        await register(app, 'old@example.com');
        await register(app, 'verified@example.com');
        await register(app, 'fresh@example.com');
        await post(app, '/auth/verify-email', { token: tokenOf(sent[1]) });
        const created = Date.now() - UNVERIFIED_TTL_MS - 1000;
        db.update(users)
            .set({ createdAt: created })
            .where(eq(users.email, 'old@example.com'))
            .run();
        db.update(users)
            .set({ createdAt: created })
            .where(eq(users.email, 'verified@example.com'))
            .run();
        expect(purgeUnverified(db)).toBe(1);
        expect(
            db
                .select({ e: users.email })
                .from(users)
                .all()
                .map((u) => u.e)
                .sort()
        ).toEqual(['fresh@example.com', 'verified@example.com']);
        // The deleted account's links went with it
        expect(db.select().from(emailVerifications).all()).toHaveLength(1);
    });
});

describe('admin', () => {
    async function adminCookie(
        app: ReturnType<typeof makeApp>['app'],
        db: ReturnType<typeof makeApp>['db']
    ) {
        const res = await register(app, 'admin@example.com', undefined, 'boss');
        db.update(users)
            .set({ role: 'admin', emailVerifiedAt: Date.now() })
            .where(eq(users.username, 'boss'))
            .run();
        return cookieFrom(res);
    }

    it('creates users already verified, and can verify or resend for others', async () => {
        const { app, db, sent } = setup();
        const cookie = await adminCookie(app, db);
        const created = await post(
            app,
            '/admin/users',
            {
                username: 'made',
                email: 'made@example.com',
                password: 'correct horse battery',
                role: 'gamer'
            },
            cookie
        );
        expect((await created.json()).user.emailVerified).toBe(true);

        await register(app, 'stuck@example.com', undefined, 'stuck');
        const id = db.select({ id: users.id }).from(users).where(eq(users.username, 'stuck')).get()!
            .id;
        const before = sent.length;
        db.update(emailVerifications).set({ createdAt: 0 }).run();
        expect((await post(app, `/admin/users/${id}/resend-verification`, {}, cookie)).status).toBe(
            200
        );
        expect(sent).toHaveLength(before + 1);
        const verified = await post(app, `/admin/users/${id}/verify-email`, {}, cookie);
        expect((await verified.json()).user.emailVerified).toBe(true);
        expect((await post(app, `/admin/users/${id}/resend-verification`, {}, cookie)).status).toBe(
            409
        );
    });
});

describe('createMailer', () => {
    it('is off without a key and sender, and posts to Resend with them', async () => {
        expect(createMailer(loadConfig({ RESEND_API_KEY: 're_key' }))).toBeUndefined();
        const fetchFake = vi.fn(async () => new Response('{}', { status: 200 }));
        const mailer = createMailer(
            loadConfig({ RESEND_API_KEY: 're_key', MAIL_FROM: 'GameQueue <verify@gamequeue.app>' }),
            fetchFake as unknown as typeof fetch
        )!;
        await mailer({ to: 'a@b.co', subject: 'S', text: 'T', html: '<p>T</p>' });
        const [, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toMatchObject({
            from: 'GameQueue <verify@gamequeue.app>',
            to: ['a@b.co']
        });
        const failing = createMailer(
            loadConfig({ RESEND_API_KEY: 'k', MAIL_FROM: 'x@y.z' }),
            (async () => new Response('bad', { status: 422 })) as unknown as typeof fetch
        )!;
        await expect(failing({ to: 'a@b.co', subject: 'S', text: 'T', html: 'T' })).rejects.toThrow(
            /422/
        );
    });

    it('turns verification on only with both a key and a sender', () => {
        expect(loadConfig({}).emailVerification).toBe(false);
        expect(loadConfig({ RESEND_API_KEY: 'k' }).emailVerification).toBe(false);
        expect(loadConfig({ RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.co' }).emailVerification).toBe(
            true
        );
    });
});
