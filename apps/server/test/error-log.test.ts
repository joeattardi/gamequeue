import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createSession } from '../src/auth/sessions.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { errorEvents, users } from '../src/db/schema.js';
import { createIgdbClient, type IgdbFailure } from '../src/igdb/client.js';
import { RequestLimiter } from '../src/igdb/limiter.js';
import {
    clearErrors,
    ERROR_MAX_ROWS,
    ERROR_RETENTION_DAYS,
    listErrors,
    pruneErrors,
    reportError
} from '../src/services/error-log.js';
import { createNotifier } from '../src/services/notify.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

const DAY = 24 * 3600_000;
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('error log service', () => {
    it('records an error with its details and lists newest first', () => {
        const spy = quiet();
        const { db } = makeApp();
        reportError(db, 'job_series_backfill', new Error('boom'), { context: { n: 1 } }, 1000);
        reportError(db, 'igdb_429', 'plain string', { status: 429 }, 2000);
        const r = listErrors(db, { limit: 10, offset: 0 }, 3000);
        expect(r.events.map((e) => e.kind)).toEqual(['igdb_429', 'job_series_backfill']);
        expect(r.events[0]!).toMatchObject({ message: 'plain string', status: 429, stack: null });
        expect(r.events[1]!.stack).toContain('boom');
        expect(r.events[1]!.context).toBe('{"n":1}');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('never throws when the database is unusable', () => {
        const spy = quiet();
        const db = openDb(':memory:'); // no migrations: the table does not exist
        expect(() => reportError(db, 'server_500', new Error('x'))).not.toThrow();
        spy.mockRestore();
    });

    it('counts per kind, filters, and pages', () => {
        const spy = quiet();
        const { db } = makeApp();
        const now = 10 * DAY;
        reportError(db, 'igdb_429', 'a', {}, now - 1000);
        reportError(db, 'igdb_429', 'b', {}, now - 2 * DAY);
        reportError(db, 'email_failed', 'c', {}, now - 500);
        const all = listErrors(db, { limit: 10, offset: 0 }, now);
        expect(all.total).toBe(3);
        expect(all.last24h).toBe(2);
        expect(all.kinds).toEqual([
            { kind: 'igdb_429', last24h: 1, total: 2 },
            { kind: 'email_failed', last24h: 1, total: 1 }
        ]);
        const only = listErrors(db, { kind: 'igdb_429', limit: 1, offset: 1 }, now);
        expect(only.total).toBe(2);
        expect(only.events.map((e) => e.message)).toEqual(['b']);
        expect(only.kinds).toHaveLength(2); // the summary ignores the filter
        spy.mockRestore();
    });

    it('builds a zero-filled daily history in the viewer time zone, grouped into three series', () => {
        const spy = quiet();
        const { db } = makeApp();
        const base = Date.UTC(2026, 9, 20, 12); // 20 Oct 2026, noon UTC
        const now = base + 3 * 3600_000;
        reportError(db, 'igdb_429', 'a', {}, now - 1000);
        reportError(db, 'igdb_429', 'b', {}, now - 2000);
        reportError(db, 'job_screenshots', 'c', {}, now - DAY);
        reportError(db, 'server_500', 'd', {}, now - 3 * DAY);
        reportError(db, 'email_failed', 'e', {}, now - 3 * DAY);
        reportError(db, 'igdb_429', 'too old', {}, now - 40 * DAY);
        const { history } = listErrors(db, { limit: 1, offset: 0 }, now);
        expect(history).toHaveLength(30);
        expect(history.at(-1)).toEqual({
            day: '2026-10-20',
            rateLimit: 2,
            igdb: 0,
            server: 0,
            starts: 0
        });
        expect(history.at(-2)).toEqual({
            day: '2026-10-19',
            rateLimit: 0,
            igdb: 1,
            server: 0,
            starts: 0
        });
        expect(history.at(-4)).toEqual({
            day: '2026-10-17',
            rateLimit: 0,
            igdb: 0,
            server: 2,
            starts: 0
        });
        expect(history[0]!.day).toBe('2026-09-21');
        expect(history.reduce((n, d) => n + d.rateLimit + d.igdb + d.server, 0)).toBe(5);

        // 23:30 in UTC-5 on the 20th is 04:30 UTC on the 21st; the offset moves it back a day
        const late = Date.UTC(2026, 9, 21, 4, 30);
        const west = makeApp().db;
        reportError(west, 'igdb_429', 'late', {}, late);
        const local = listErrors(west, { limit: 1, offset: 0, tzOffsetMin: 300 }, late).history;
        expect(local.at(-1)).toEqual({
            day: '2026-10-20',
            rateLimit: 1,
            igdb: 0,
            server: 0,
            starts: 0
        });
        spy.mockRestore();
    });

    it('prunes by age and by row count', () => {
        const spy = quiet();
        const { db } = makeApp();
        const now = 100 * DAY;
        reportError(db, 'server_500', 'old', {}, now - (ERROR_RETENTION_DAYS + 1) * DAY);
        reportError(db, 'server_500', 'recent', {}, now - DAY);
        expect(pruneErrors(db, now)).toBe(1);
        expect(listErrors(db, { limit: 10, offset: 0 }, now).events.map((e) => e.message)).toEqual([
            'recent'
        ]);
        db.insert(errorEvents)
            .values(
                Array.from({ length: ERROR_MAX_ROWS + 5 }, () => ({
                    at: now,
                    kind: 'server_500',
                    message: 'flood'
                }))
            )
            .run();
        pruneErrors(db, now);
        expect(listErrors(db, { limit: 1, offset: 0 }, now).total).toBe(ERROR_MAX_ROWS);
        spy.mockRestore();
    });

    it('clears everything or one kind', () => {
        const spy = quiet();
        const { db } = makeApp();
        reportError(db, 'igdb_429', 'a');
        reportError(db, 'email_failed', 'b');
        expect(clearErrors(db, 'igdb_429').deleted).toBe(1);
        expect(clearErrors(db).deleted).toBe(1);
        spy.mockRestore();
    });
});

describe('where errors are recorded', () => {
    it('records unhandled request errors with the route, not the user-facing message', async () => {
        const spy = quiet();
        const config = loadConfig({});
        const db = openDb(':memory:');
        const app = createApp({ db, config });
        app.get('/api/boom', () => {
            throw new Error('kaboom');
        });
        const res = await app.request('/api/boom');
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Internal server error' });
        const [e] = listErrors(db, { limit: 5, offset: 0 }).events;
        expect(e).toMatchObject({
            kind: 'server_500',
            message: 'kaboom',
            status: 500,
            route: 'GET /api/boom'
        });
        spy.mockRestore();
    });

    it('records failed notification emails', async () => {
        const failures: unknown[] = [];
        const config = loadConfig({ RESEND_API_KEY: 'k', NOTIFY_EMAIL: 'me@example.com' });
        const fail = vi.fn(async () => new Response('nope', { status: 500 }));
        createNotifier(config, fail as unknown as typeof fetch, (e) => failures.push(e))('s', 'b');
        await new Promise((r) => setTimeout(r, 0));
        expect(String(failures[0])).toContain('Resend answered 500');
    });

    it('reports every IGDB attempt that fails, noting retries', async () => {
        const seen: IgdbFailure[] = [];
        const replies = [429, 429, 200];
        const fetchFn = (async (url: string) => {
            if (String(url).includes('oauth2'))
                return new Response(JSON.stringify({ access_token: 't', expires_in: 5_000_000 }));
            const status = replies.shift()!;
            return new Response('[]', { status });
        }) as unknown as typeof fetch;
        const igdb = createIgdbClient({
            clientId: 'id',
            clientSecret: 's',
            fetchFn,
            limiter: new RequestLimiter(),
            sleep: async () => {},
            onError: (f) => seen.push(f)
        });
        await igdb.search('hades');
        expect(seen).toEqual([
            expect.objectContaining({ status: 429, endpoint: 'games', willRetry: true }),
            expect.objectContaining({ status: 429, endpoint: 'games', willRetry: true })
        ]);
    });

    it('reports a final failure as not retried', async () => {
        const seen: IgdbFailure[] = [];
        const fetchFn = (async (url: string) =>
            String(url).includes('oauth2')
                ? new Response(JSON.stringify({ access_token: 't', expires_in: 5_000_000 }))
                : new Response('{}', { status: 500 })) as unknown as typeof fetch;
        const igdb = createIgdbClient({
            clientId: 'id',
            clientSecret: 's',
            fetchFn,
            sleep: async () => {},
            onError: (f) => seen.push(f)
        });
        await expect(igdb.search('x')).rejects.toThrow();
        expect(seen).toEqual([expect.objectContaining({ status: 500, willRetry: false })]);
    });
});

describe('admin errors API', () => {
    async function setup() {
        const { app, db } = makeApp();
        const root = db
            .insert(users)
            .values({ username: 'root', email: 'r@example.com', passwordHash: 'x', role: 'admin' })
            .returning({ id: users.id })
            .get();
        const cookie = `gq_session=${createSession(db, root.id).token}`;
        const origin = 'http://localhost';
        return { app, db, cookie, origin };
    }

    it('is admin-only', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'ann@example.com', undefined, 'ann'));
        expect((await app.request('/api/admin/errors', { headers: { cookie } })).status).toBe(403);
        const del = await app.request('/api/admin/errors', {
            ...json({}, { cookie, origin: 'http://localhost' }),
            method: 'DELETE'
        });
        expect(del.status).toBe(403);
    });

    it('lists, filters, validates the kind, and clears', async () => {
        const spy = quiet();
        const { app, db, cookie, origin } = await setup();
        reportError(db, 'igdb_429', 'slow down', { status: 429 });
        reportError(db, 'email_failed', 'no mail');
        const get = async (q = '') => app.request(`/api/admin/errors${q}`, { headers: { cookie } });

        const all = await (await get()).json();
        expect(all.total).toBe(2);
        expect(all.retentionDays).toBe(ERROR_RETENTION_DAYS);

        const filtered = await (await get('?kind=igdb_429')).json();
        expect(filtered.events).toHaveLength(1);
        expect(filtered.events[0].message).toBe('slow down');

        expect((await get('?kind=nonsense')).status).toBe(400);

        const del = (q: string) =>
            app.request(`/api/admin/errors${q}`, {
                ...json({}, { cookie, origin }),
                method: 'DELETE'
            });
        expect(await (await del('?kind=igdb_429')).json()).toEqual({ deleted: 1 });
        expect(await (await del('')).json()).toEqual({ deleted: 1 });
        expect((await (await get()).json()).total).toBe(0);
        spy.mockRestore();
    });
});
