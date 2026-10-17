import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { FailureLimiter } from '../src/auth/rate-limit.js';
import { createSession, hashToken, resolveSession, SESSION_TTL_MS } from '../src/auth/sessions.js';
import { sessions, slots, users } from '../src/db/schema.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

describe('password hashing', () => {
    it('uses argon2id and verifies', async () => {
        const h = await hashPassword('hunter2hunter2');
        expect(h.startsWith('$argon2id$')).toBe(true);
        expect(await verifyPassword(h, 'hunter2hunter2')).toBe(true);
        expect(await verifyPassword(h, 'wrong')).toBe(false);
        expect(await verifyPassword('garbage', 'x')).toBe(false);
    });
});

describe('register', () => {
    it('creates a user, default slots and a session cookie', async () => {
        const { app, db } = makeApp();
        const res = await register(app, 'Me@Example.com');
        expect(res.status).toBe(201);
        expect((await res.json()).user.email).toBe('me@example.com');
        const cookie = res.headers.get('set-cookie')!;
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(
            db
                .select()
                .from(slots)
                .all()
                .map((s) => s.name)
        ).toEqual(['Main', 'Secondary', 'Palate cleanser']);
    });

    it('returns 403 when signups are disabled', async () => {
        const { app, db } = makeApp({ signupsEnabled: false });
        expect((await register(app)).status).toBe(403);
        expect(db.select().from(users).all()).toHaveLength(0);
    });

    it('rejects short passwords and duplicate emails', async () => {
        const { app } = makeApp();
        expect((await register(app, 'a@b.co', 'short')).status).toBe(400);
        expect((await register(app, 'dup@b.co')).status).toBe(201);
        expect((await register(app, 'dup@b.co')).status).toBe(409);
    });
});

describe('login and sessions', () => {
    it('logs in, stores only a hash of the token, and serves /me', async () => {
        const { app, db } = makeApp();
        await register(app);
        const res = await app.request(
            '/api/auth/login',
            json({ email: 'me@example.com', password: 'correct horse battery' })
        );
        expect(res.status).toBe(200);
        const cookie = cookieFrom(res);
        const token = cookie.split('=')[1]!;
        const ids = db
            .select()
            .from(sessions)
            .all()
            .map((s) => s.id);
        expect(ids).toContain(hashToken(token));
        expect(ids).not.toContain(token);

        const me = await app.request('/api/auth/me', { headers: { cookie } });
        expect(me.status).toBe(200);
        expect((await me.json()).user.email).toBe('me@example.com');
    });

    it('gives the same generic error for unknown email and wrong password', async () => {
        const { app } = makeApp();
        await register(app);
        const a = await app.request(
            '/api/auth/login',
            json({ email: 'me@example.com', password: 'nope nope nope' })
        );
        const b = await app.request(
            '/api/auth/login',
            json({ email: 'ghost@example.com', password: 'nope nope nope' })
        );
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        expect(await a.json()).toEqual(await b.json());
    });

    it('rate limits repeated failures with Retry-After', async () => {
        const { app } = makeApp();
        await register(app);
        const bad = () =>
            app.request(
                '/api/auth/login',
                json({ email: 'me@example.com', password: 'wrong wrong' })
            );
        for (let i = 0; i < 5; i++) expect((await bad()).status).toBe(401);
        const blocked = await bad();
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
        // even the right password is refused while limited
        const right = await app.request(
            '/api/auth/login',
            json({ email: 'me@example.com', password: 'correct horse battery' })
        );
        expect(right.status).toBe(429);
    });

    it('logout invalidates the session', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app));
        await app.request('/api/auth/logout', {
            method: 'POST',
            headers: { cookie, origin: 'http://localhost' }
        });
        expect((await app.request('/api/auth/me', { headers: { cookie } })).status).toBe(401);
    });

    it('requires authentication for /me', async () => {
        const { app } = makeApp();
        expect((await app.request('/api/auth/me')).status).toBe(401);
    });

    it('expires and slides sessions', () => {
        const { db } = makeApp();
        const u = db.insert(users).values({ email: 'x@y.z', passwordHash: 'h' }).returning().get();
        const t0 = 1_000_000;
        const { token } = createSession(db, u.id, t0);
        expect(resolveSession(db, token, t0 + 1000)?.renewed).toBe(false);
        const late = t0 + SESSION_TTL_MS * 0.6;
        const slid = resolveSession(db, token, late);
        expect(slid?.renewed).toBe(true);
        expect(slid?.expiresAt).toBe(late + SESSION_TTL_MS);
        expect(resolveSession(db, token, late + SESSION_TTL_MS + 1)).toBeUndefined();
        expect(
            db
                .select()
                .from(sessions)
                .where(eq(sessions.id, hashToken(token)))
                .all()
        ).toHaveLength(0);
    });
});

describe('CSRF', () => {
    it('rejects cross-origin mutations and allows configured origins', async () => {
        const { app } = makeApp({ allowedOrigins: ['http://localhost:5173'] });
        const body = { email: 'me@example.com', password: 'correct horse battery' };
        const evil = await app.request(
            '/api/auth/register',
            json(body, { origin: 'https://evil.example' })
        );
        expect(evil.status).toBe(403);
        const form = await app.request('/api/auth/register', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                origin: 'https://evil.example'
            },
            body: 'email=a'
        });
        expect(form.status).toBe(403);
        const ok = await app.request(
            '/api/auth/register',
            json(body, { origin: 'http://localhost:5173' })
        );
        expect(ok.status).toBe(201);
    });

    it('requires a JSON content type on mutations', async () => {
        const { app } = makeApp();
        const post = (type: string) =>
            app.request('/api/auth/login', {
                method: 'POST',
                headers: { 'content-type': type },
                body: '{}'
            });
        expect((await post('application/xml')).status).toBe(415); // our check
        expect((await post('text/plain')).status).toBe(403); // Hono csrf: form-like type without Origin
    });
});

describe('FailureLimiter', () => {
    it('resets after the window', () => {
        let t = 0;
        const l = new FailureLimiter(2, 1000, () => t);
        l.fail('k');
        l.fail('k');
        expect(l.retryAfter('k')).toBe(1);
        t = 1001;
        expect(l.retryAfter('k')).toBe(0);
    });
});
