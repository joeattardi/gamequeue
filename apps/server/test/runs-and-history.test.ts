import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/auth/sessions.js';
import { users } from '../src/db/schema.js';
import { createIgdbClient, type IgdbClientOptions } from '../src/igdb/client.js';
import { listErrors, setErrorAlerter } from '../src/services/error-log.js';
import { igdbHistory, pruneIgdbHistory, recordIgdbAttempt } from '../src/services/igdb-history.js';
import { endRun, heartbeat, listRuns, pruneRuns, startRun } from '../src/services/server-runs.js';
import { makeApp } from './helpers.js';

const DAY = 24 * 3600_000;
const now = Date.UTC(2026, 9, 20, 12);

afterEach(() => {
    setErrorAlerter(undefined);
    vi.restoreAllMocks();
});

describe('IGDB request history', () => {
    it('counts attempts per UTC day and zero-fills 30 days', () => {
        const { db } = makeApp();
        recordIgdbAttempt(db, true, 200, now);
        recordIgdbAttempt(db, true, 200, now);
        recordIgdbAttempt(db, false, 429, now);
        recordIgdbAttempt(db, false, 500, now - DAY);
        recordIgdbAttempt(db, false, null, now - DAY);
        recordIgdbAttempt(db, true, 200, now - 40 * DAY);
        const h = igdbHistory(db, now);
        expect(h).toHaveLength(30);
        expect(h.at(-1)).toEqual({ day: '2026-10-20', ok: 2, rateLimited: 1, failed: 0 });
        expect(h.at(-2)).toEqual({ day: '2026-10-19', ok: 0, rateLimited: 0, failed: 2 });
        expect(h[0]).toEqual({ day: '2026-09-21', ok: 0, rateLimited: 0, failed: 0 });
    });

    it('prunes rows older than 90 days', () => {
        const { db } = makeApp();
        recordIgdbAttempt(db, true, 200, now - 100 * DAY);
        recordIgdbAttempt(db, true, 200, now);
        expect(pruneIgdbHistory(db, now)).toBe(1);
        expect(igdbHistory(db, now).at(-1)!.ok).toBe(1);
    });

    it('the client reports every attempt, successful or not', async () => {
        const seen: { ok: boolean; status: number | null }[] = [];
        const replies = [429, 200];
        const opts: IgdbClientOptions = {
            clientId: 'id',
            clientSecret: 's',
            sleep: async () => {},
            onAttempt: (a) => seen.push(a),
            fetchFn: (async (url: string) =>
                String(url).includes('oauth2')
                    ? new Response(JSON.stringify({ access_token: 't', expires_in: 5_000_000 }))
                    : new Response('[]', { status: replies.shift() })) as unknown as typeof fetch
        };
        await createIgdbClient(opts).search('x');
        expect(seen).toEqual([
            { ok: false, status: 429 },
            { ok: true, status: 200 }
        ]);
    });
});

describe('server runs', () => {
    it('records a start and a clean stop', () => {
        const { db } = makeApp();
        const id = startRun(db, 'abc1234', now);
        heartbeat(db, id, now + 60_000);
        expect(listRuns(db)[0]).toMatchObject({ ended: null, lastSeenAt: now + 60_000 });
        endRun(db, id, 'clean', now + 90_000);
        expect(listRuns(db)[0]).toMatchObject({
            version: 'abc1234',
            ended: 'clean',
            endedAt: now + 90_000
        });
        expect(listErrors(db, { limit: 5, offset: 0 }, now).total).toBe(0);
        startRun(db, 'abc1234', now + DAY);
        expect(listErrors(db, { limit: 5, offset: 0 }, now).total).toBe(0);
    });

    it('reports a run that never ended as an unclean shutdown, once', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { db } = makeApp();
        const first = startRun(db, 'v1', now);
        heartbeat(db, first, now + 5 * 60_000);
        startRun(db, 'v2', now + DAY);
        const runs = listRuns(db);
        expect(runs.map((r) => r.ended)).toEqual([null, 'unclean']);
        expect(runs[1]).toMatchObject({ endedAt: now + 5 * 60_000 });
        const { events } = listErrors(db, { limit: 5, offset: 0 }, now);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ kind: 'unclean_shutdown' });
        expect(events[0]!.message).toContain('version v1');
        startRun(db, 'v3', now + 2 * DAY); // v2 is still open, v1 is not reported again
        expect(listErrors(db, { limit: 5, offset: 0 }, now).total).toBe(2);
    });

    it('a crash is not reported again at the next start', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { db } = makeApp();
        const id = startRun(db, 'v1', now);
        endRun(db, id, 'crash', now + 1000);
        startRun(db, 'v1', now + 2000);
        expect(listErrors(db, { limit: 5, offset: 0 }, now).total).toBe(0);
    });

    it('prunes old runs and counts starts per day in the error history', () => {
        const { db } = makeApp();
        const old = startRun(db, 'v0', now - 100 * DAY);
        endRun(db, old, 'clean', now - 100 * DAY + 1000);
        const a = startRun(db, 'v1', now - DAY);
        endRun(db, a, 'clean', now - DAY + 1000);
        const b = startRun(db, 'v1', now - 1000);
        endRun(db, b, 'clean', now - 500);
        startRun(db, 'v1', now);
        const { history } = listErrors(db, { limit: 1, offset: 0 }, now);
        expect(history.at(-1)!.starts).toBe(2);
        expect(history.at(-2)!.starts).toBe(1);
        expect(pruneRuns(db, now)).toBe(1);
    });
});

describe('admin API', () => {
    it('serves IGDB history and the run list', async () => {
        const { app, db, config } = makeApp();
        config.version = 'abc1234';
        const root = db
            .insert(users)
            .values({ username: 'root', email: 'r@example.com', passwordHash: 'x', role: 'admin' })
            .returning({ id: users.id })
            .get();
        const headers = { cookie: `gq_session=${createSession(db, root.id).token}` };
        startRun(db, config.version);
        recordIgdbAttempt(db, true, 200);

        const server = await (await app.request('/api/admin/server', { headers })).json();
        expect(server.version).toBe('abc1234');
        expect(server.runs[0]).toMatchObject({ version: 'abc1234', ended: null });

        const igdb = await (await app.request('/api/admin/igdb', { headers })).json();
        expect(igdb.history).toHaveLength(30);
        expect(igdb.history.at(-1).ok).toBe(1);
    });
});
