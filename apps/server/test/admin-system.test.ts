import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createIgdbClient } from '../src/igdb/client.js';
import { RequestLimiter } from '../src/igdb/limiter.js';
import { createSession } from '../src/auth/sessions.js';
import { games, series, sessions, users } from '../src/db/schema.js';
import { cookieFrom, fakeGame, fakeIgdb, json, makeApp, register } from './helpers.js';

const origin = 'http://localhost';

async function setup(opts: { signups?: boolean; igdb?: Parameters<typeof makeApp>[1] } = {}) {
    const { client } = fakeIgdb([fakeGame(1, 'Hades'), fakeGame(2, 'Celeste')]);
    const { app, db } = makeApp({ signupsEnabled: opts.signups ?? true }, opts.igdb ?? client);
    // Signups may be closed, so make the admin directly instead of registering
    const root = db
        .insert(users)
        .values({ username: 'root', email: 'root@example.com', passwordHash: 'x', role: 'admin' })
        .returning({ id: users.id })
        .get();
    const admin = `gq_session=${createSession(db, root.id).token}`;
    const call = (path: string, method = 'GET', body?: unknown, cookie = admin) =>
        method === 'GET'
            ? app.request(`/api/admin${path}`, { headers: { cookie } })
            : app.request(`/api/admin${path}`, {
                  ...json(body ?? {}, { cookie, origin }),
                  method
              });
    return { app, db, admin, call };
}

describe('admin-only', () => {
    it('rejects gamers on every new route', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'ann@example.com', undefined, 'ann'));
        const paths: [string, string][] = [
            ['GET', '/server'],
            ['GET', '/settings'],
            ['PUT', '/settings'],
            ['GET', '/igdb'],
            ['POST', '/igdb/ping'],
            ['POST', '/maintenance/purge-games'],
            ['POST', '/maintenance/purge-sessions'],
            ['POST', '/maintenance/vacuum']
        ];
        for (const [method, path] of paths) {
            const res = await app.request(`/api/admin${path}`, {
                ...json({}, { cookie, origin }),
                method,
                ...(method === 'GET' ? { body: undefined } : {})
            });
            expect(res.status, `${method} ${path}`).toBe(403);
        }
    });
});

describe('signups setting', () => {
    it('starts from the environment value and an admin choice overrides it', async () => {
        const { app, call } = await setup({ signups: false });
        expect(await (await call('/settings')).json()).toEqual({
            signupsEnabled: false,
            signupsDefault: false,
            signupsOverridden: false
        });
        const closed = await app.request(
            '/api/auth/register',
            json({ username: 'bob', email: 'bob@example.com', password: 'correct horse battery' })
        );
        expect(closed.status).toBe(403);

        const res = await call('/settings', 'PUT', { signupsEnabled: true });
        expect(await res.json()).toMatchObject({ signupsEnabled: true, signupsOverridden: true });
        expect(await (await app.request('/api/auth/config')).json()).toEqual({
            signupsEnabled: true
        });
        const open = await app.request(
            '/api/auth/register',
            json({ username: 'bob', email: 'bob@example.com', password: 'correct horse battery' })
        );
        expect(open.status).toBe(201);

        await call('/settings', 'PUT', { signupsEnabled: false });
        expect(await (await app.request('/api/auth/config')).json()).toEqual({
            signupsEnabled: false
        });
        expect((await call('/settings', 'PUT', { signupsEnabled: 'yes' })).status).toBe(400);
    });
});

describe('maintenance', () => {
    it('purges only cached games nobody uses, and series nothing links to', async () => {
        const { app, db, admin, call } = await setup();
        const add = (igdbId: number) =>
            app.request(
                '/api/entries',
                json({ igdbId, platformIds: [6] }, { cookie: admin, origin })
            );
        const e1 = (await (await add(1)).json()).entry;
        const e2 = (await (await add(2)).json()).entry;
        db.insert(series).values({ id: 99, name: 'Orphan series' }).run();
        await app.request(`/api/entries/${e2.id}`, {
            method: 'DELETE',
            headers: { cookie: admin, origin }
        });

        const stats = await (await call('/database')).json();
        expect(stats.cache).toMatchObject({ games: 2, gamesInUse: 1, unusedSeries: 1 });

        const res = await call('/maintenance/purge-games', 'POST');
        expect(await res.json()).toEqual({ deletedGames: 1, deletedSeries: 1 });
        expect(
            db
                .select()
                .from(games)
                .all()
                .map((g) => g.id)
        ).toEqual([e1.gameId ?? 1]);
        expect(await (await call('/maintenance/purge-games', 'POST')).json()).toEqual({
            deletedGames: 0,
            deletedSeries: 0
        });
    });

    it('purges only expired sessions', async () => {
        const { db, call } = await setup();
        const userId = db.select().from(users).get()!.id;
        db.insert(sessions)
            .values({ id: 'old', userId, expiresAt: Date.now() - 1000 })
            .run();
        expect(await (await call('/maintenance/purge-sessions', 'POST')).json()).toEqual({
            deleted: 1
        });
        expect(db.select().from(sessions).all()).toHaveLength(1);
    });

    it('vacuums and reports sizes', async () => {
        const { call } = await setup();
        const res = await call('/maintenance/vacuum', 'POST');
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            beforeBytes: expect.any(Number),
            afterBytes: expect.any(Number)
        });
    });
});

describe('server info', () => {
    it('reports the process, config and disk without secrets', async () => {
        const { call } = await setup();
        const raw = await (await call('/server')).text();
        const info = JSON.parse(raw);
        expect(info.nodeVersion).toBe(process.version);
        expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
        expect(info.config.igdbConfigured).toBe(false);
        expect(info.disk.totalBytes).toBeGreaterThan(info.disk.freeBytes);
        expect(raw).not.toMatch(/secret|password|hash/i);
    });
});

describe('IGDB health', () => {
    function realClient(handler: (endpoint: string) => Response) {
        let t = 1_000_000;
        const fetchFn = (async (url: string) =>
            url.startsWith('https://id.twitch.tv')
                ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 5_000_000 }))
                : handler(url.replace('https://api.igdb.com/v4/', ''))) as unknown as typeof fetch;
        return createIgdbClient({
            clientId: 'c',
            clientSecret: 's',
            fetchFn,
            limiter: new RequestLimiter(1000, 8),
            sleep: async () => {},
            now: () => (t += 5)
        });
    }

    it('reports not configured without a client', async () => {
        const { app, db } = makeApp();
        const cookie = cookieFrom(await register(app, 'root@example.com', undefined, 'root'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
        const res = await app.request('/api/admin/igdb', { headers: { cookie } });
        expect(await res.json()).toMatchObject({ configured: false, tracked: false });
        const ping = await app.request('/api/admin/igdb/ping', {
            ...json({}, { cookie, origin })
        });
        expect(ping.status).toBe(409);
    });

    it('counts requests, remembers the last error and pings', async () => {
        let fail = false;
        const igdb = realClient(() =>
            fail ? new Response('{}', { status: 500 }) : new Response('[]')
        );
        const { call } = await setup({ igdb });

        const ok = await (await call('/igdb/ping', 'POST')).json();
        expect(ok).toMatchObject({ ok: true, error: null });
        let status = await (await call('/igdb')).json();
        expect(status).toMatchObject({
            configured: true,
            tracked: true,
            token: { valid: true },
            requests24h: { total: 1, failed: 0 },
            lastError: null
        });
        expect(status.lastSuccessAt).toBeGreaterThan(0);

        fail = true;
        const bad = await (await call('/igdb/ping', 'POST')).json();
        expect(bad.ok).toBe(false);
        expect(bad.error).toMatch(/500/);
        status = await (await call('/igdb')).json();
        expect(status.requests24h).toEqual({ total: 2, failed: 1 });
        expect(status.lastError).toMatchObject({ status: 500 });
    });
});
