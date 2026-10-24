import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorEvents, users } from '../src/db/schema.js';
import { openDb } from '../src/db/client.js';
import { createMirrorIgdbClient } from '../src/mirror/client.js';
import { createDumpSource } from '../src/mirror/dumps.js';
import { PermanentMirrorError } from '../src/mirror/errors.js';
import { runMirrorJob } from '../src/mirror/job.js';
import { assertFreeSpace, mirrorStatusPath, readMirrorRun } from '../src/mirror/status.js';
import { getMirrorStatus, reportMirrorRunFailure } from '../src/services/mirror-status.js';
import { loadConfig } from '../src/config.js';
import { cookieFrom, makeApp, register } from './helpers.js';
import { fakeSource } from './mirror-fixtures.js';

let dir: string;
let path: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mirror-job-'));
    path = join(dir, 'igdb.db');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const job = (over: Partial<Parameters<typeof runMirrorJob>[0]> = {}) =>
    runMirrorJob({ source: fakeSource(), path, minGames: 1, retryDelaysMs: [], ...over });

describe('runMirrorJob', () => {
    it('reports a build, then a run that found nothing new, and writes the status file', async () => {
        let t = 1_800_000_000_000;
        const now = () => (t += 1000);

        const first = await job({ now });
        expect(first).toMatchObject({
            ok: true,
            error: null,
            result: 'built',
            dump: '1700000000_games.csv'
        });
        expect(first.lastSuccessAt).toBe(first.lastRunAt);
        expect(readMirrorRun(path)).toEqual({ run: first, unreadable: false });

        const second = await job({ now });
        expect(second).toMatchObject({ ok: true, result: 'current' });
        expect(second.lastRunAt).toBeGreaterThan(first.lastRunAt);
        expect(readMirrorRun(path).run).toEqual(second);
    });

    it('reports a failure with its reason, keeps the old mirror and the last success time', async () => {
        const good = await job();
        const broken = fakeSource({}, '1700086400_games.csv');
        broken.open = async () => {
            throw new Error('download failed');
        };
        const failed = await job({ source: broken });

        expect(failed).toMatchObject({
            ok: false,
            error: 'download failed',
            result: null,
            dump: null,
            lastSuccessAt: good.lastSuccessAt
        });
        expect(readMirrorRun(path).run).toEqual(failed);
        // The old mirror still serves
        expect(
            getMirrorStatus(openDb(':memory:'), loadConfig({ IGDB_MIRROR_PATH: path })).mirror
        ).toMatchObject({ dump: '1700000000_games.csv' });
    });

    it('records a failure even when nothing has ever succeeded', async () => {
        const source = fakeSource();
        source.list = async () => {
            throw new Error('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set');
        };
        const failed = await job({ source });
        expect(failed).toMatchObject({ ok: false, lastSuccessAt: null });
        expect(failed.error).toContain('IGDB_CLIENT_ID');
    });

    it('refuses to start an import without enough free disk space, before downloading', async () => {
        const source = fakeSource();
        const run = await job({ source, minFreeBytes: Number.MAX_SAFE_INTEGER });
        expect(run.ok).toBe(false);
        expect(run.error).toMatch(/Only \d+ MB free .* needs at least/);
        expect(source.opened).toEqual([]);
        expect(existsSync(path)).toBe(false);
    });

    it('does not need free space when there is nothing to build', async () => {
        await job();
        const run = await job({ minFreeBytes: Number.MAX_SAFE_INTEGER });
        expect(run).toMatchObject({ ok: true, result: 'current' });
    });

    it('still returns the run, and says so, when the status file cannot be written', async () => {
        // A directory where the file should go makes the final rename fail
        mkdirSync(mirrorStatusPath(path));
        const logs: string[] = [];
        const run = await job({ log: (m) => logs.push(m) });
        expect(run).toMatchObject({ ok: true, result: 'built' });
        expect(logs.join('\n')).toContain('could not write the status file');
    });
});

describe('status file', () => {
    it('is missing, unreadable or valid', () => {
        expect(readMirrorRun(path)).toEqual({ run: null, unreadable: false });
        writeFileSync(mirrorStatusPath(path), '{ half a fi');
        expect(readMirrorRun(path)).toEqual({ run: null, unreadable: true });
        writeFileSync(mirrorStatusPath(path), JSON.stringify({ ok: 'yes' }));
        expect(readMirrorRun(path)).toEqual({ run: null, unreadable: true });
    });

    it('is written next to the mirror file, atomically (no temp file left)', async () => {
        await job();
        expect(mirrorStatusPath(path)).toBe(join(dir, 'mirror-status.json'));
        expect(existsSync(`${mirrorStatusPath(path)}.tmp`)).toBe(false);
        expect(JSON.parse(readFileSync(mirrorStatusPath(path), 'utf8'))).toMatchObject({
            ok: true
        });
    });
});

describe('assertFreeSpace', () => {
    it('passes for a modest requirement and names the shortfall otherwise', () => {
        expect(() => assertFreeSpace(dir, 1)).not.toThrow();
        expect(() => assertFreeSpace(dir, Number.MAX_SAFE_INTEGER)).toThrow(
            /MB free in .*mirror-job/
        );
    });
});

describe('getMirrorStatus and the admin route', () => {
    it('describes the file, the last run and the cache sync', async () => {
        await job();
        const db = openDb(':memory:');
        const status = getMirrorStatus(db, loadConfig({ IGDB_MIRROR_PATH: path }));
        expect(status.mirror).toMatchObject({
            dump: '1700000000_games.csv',
            dumpAt: 1_700_000_000_000,
            games: 15,
            searchable: 12,
            sizeBytes: expect.any(Number)
        });
        expect(status.mirror!.builtAt).toBeGreaterThan(1_700_000_000_000);
        expect(status.run).toMatchObject({ ok: true, result: 'built' });
        expect(status.runUnreadable).toBe(false);
        expect(status.syncedDump).toBeNull();
    });

    it('has nothing to report before the first run', () => {
        const status = getMirrorStatus(openDb(':memory:'), loadConfig({ IGDB_MIRROR_PATH: path }));
        expect(status).toEqual({
            mirror: null,
            run: null,
            runUnreadable: false,
            syncedDump: null,
            lookups: null
        });
    });

    it('is admin only and serves the status to admins', async () => {
        await job();
        const { app, db } = makeApp({ igdbMirrorPath: path });
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        expect((await app.request('/api/admin/mirror')).status).toBe(401);
        expect((await app.request('/api/admin/mirror', { headers: { cookie } })).status).toBe(403);

        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'joe')).run();
        const res = await app.request('/api/admin/mirror', { headers: { cookie } });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            mirror: { games: 15 },
            run: { ok: true, result: 'built' }
        });
    });
});

describe('lookup counters on the admin route', () => {
    it('reports how lookups were answered, with the totals and a row per kind', async () => {
        await job();
        const client = createMirrorIgdbClient({ path });
        const { app, db } = makeApp({ igdbMirrorPath: path }, client);
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'joe')).run();

        await client.search('hades');
        await client.search('witcer'); // no live client here: still answered by the mirror
        await client.fetchGame(1);
        const body = await (await app.request('/api/admin/mirror', { headers: { cookie } })).json();

        expect(body.lookups).toMatchObject({ local: 3, live: 0 });
        expect(body.lookups.since).toBeGreaterThan(0);
        expect(body.lookups.methods).toHaveLength(8);
        expect(body.lookups.methods.find((m: { method: string }) => m.method === 'search')).toEqual(
            { method: 'search', local: 2, live: 0 }
        );
    });

    it('is null when the server has no mirror client', async () => {
        const { app, db } = makeApp({ igdbMirrorPath: path });
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'joe')).run();
        const body = await (await app.request('/api/admin/mirror', { headers: { cookie } })).json();
        expect(body.lookups).toBeNull();
    });
});

describe('reportMirrorRunFailure', () => {
    const failing = async (when?: number) => {
        const source = fakeSource();
        source.list = async () => {
            throw new Error('dumps are down');
        };
        return job({ source, now: when ? () => when : undefined });
    };
    const events = (db: ReturnType<typeof openDb>) => db.select().from(errorEvents).all();

    it('records a failed run once, and the next failed run again', async () => {
        const db = openDb(':memory:');
        const config = loadConfig({ IGDB_MIRROR_PATH: path });

        reportMirrorRunFailure(db, config); // nothing has run
        await job();
        reportMirrorRunFailure(db, config); // success
        expect(events(db)).toEqual([]);

        await failing(1_800_000_001_000);
        reportMirrorRunFailure(db, config);
        reportMirrorRunFailure(db, config);
        expect(events(db)).toMatchObject([{ kind: 'job_mirror_build', message: 'dumps are down' }]);

        await failing(1_800_086_400_000); // the next day fails too
        reportMirrorRunFailure(db, config);
        expect(events(db)).toHaveLength(2);
    });
});

describe('retrying a failed build', () => {
    /** A source whose `games` download fails with `error` the first `failures` times. */
    const flaky = (
        failures: number,
        error: Error = new Error('connection reset'),
        dump = '1700000000_games.csv'
    ) => {
        const source = fakeSource({}, dump);
        const open = source.open.bind(source);
        let failed = 0;
        source.open = async (endpoint) => {
            if (endpoint === 'games' && failed < failures) {
                failed++;
                throw error;
            }
            return open(endpoint);
        };
        return source;
    };
    const waits: number[] = [];
    const retrying = (source: ReturnType<typeof fakeSource>, delays = [60_000, 300_000]) =>
        job({
            source,
            retryDelaysMs: delays,
            sleep: async (ms) => {
                waits.push(ms);
            }
        });
    beforeEach(() => {
        waits.length = 0;
    });

    it('builds on the second try after a dropped download, and says how many it took', async () => {
        const run = await retrying(flaky(1));
        expect(run).toMatchObject({ ok: true, result: 'built', attempts: 2, error: null });
        expect(waits).toEqual([60_000]);
        expect(readMirrorRun(path).run).toEqual(run);
        expect(existsSync(`${path}.new`)).toBe(false);
    });

    it('waits longer before the third try, then succeeds', async () => {
        const run = await retrying(flaky(2));
        expect(run).toMatchObject({ ok: true, attempts: 3 });
        expect(waits).toEqual([60_000, 300_000]);
    });

    it('gives up after the last try and reports the last error', async () => {
        const run = await retrying(flaky(10, new Error('connection reset')));
        expect(run).toMatchObject({ ok: false, error: 'connection reset', attempts: 3 });
        expect(waits).toEqual([60_000, 300_000]);
        expect(existsSync(path)).toBe(false);
    });

    it('logs each failed try', async () => {
        const logs: string[] = [];
        await job({
            source: flaky(1),
            retryDelaysMs: [60_000],
            sleep: async () => {},
            log: (m) => logs.push(m)
        });
        expect(logs).toContain('attempt 1 failed: connection reset; trying again in 60s');
    });

    it('does not retry a failure that trying again cannot fix', async () => {
        const credentials = await retrying(
            flaky(10, new PermanentMirrorError('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set'))
        );
        expect(credentials).toMatchObject({ ok: false, attempts: 1 });
        const space = await job({
            minFreeBytes: Number.MAX_SAFE_INTEGER,
            retryDelaysMs: [1],
            sleep: async (ms) => {
                waits.push(ms);
            }
        });
        expect(space).toMatchObject({ ok: false, attempts: 1 });
        const tooSmall = await job({
            minGames: 100,
            retryDelaysMs: [1],
            sleep: async (ms) => {
                waits.push(ms);
            }
        });
        expect(tooSmall).toMatchObject({ ok: false, attempts: 1 });
        expect(tooSmall.error).toContain('only 15 games');
        expect(waits).toEqual([]);
    });

    it('does not wait at all when the first try works', async () => {
        const run = await retrying(fakeSource());
        expect(run).toMatchObject({ ok: true, attempts: 1 });
        expect(waits).toEqual([]);
    });

    it('keeps the old mirror and its last-success time through failed tries', async () => {
        const good = await job();
        // A newer dump, so a build is really attempted (an unchanged one is skipped)
        const run = await retrying(
            flaky(10, new Error('connection reset'), '1700086400_games.csv'),
            [1, 1]
        );
        expect(run).toMatchObject({ ok: false, lastSuccessAt: good.lastSuccessAt });
        expect(readMirrorRun(path).run?.attempts).toBe(3);
        expect(
            getMirrorStatus(openDb(':memory:'), loadConfig({ IGDB_MIRROR_PATH: path })).mirror
        ).toMatchObject({ dump: '1700000000_games.csv' });
    });

    it('reads a status file written before attempts existed as one try', () => {
        writeFileSync(
            mirrorStatusPath(path),
            JSON.stringify({
                lastRunAt: 1,
                ok: true,
                error: null,
                result: 'built',
                lastSuccessAt: 1,
                dump: 'x_games.csv',
                seconds: 5
            })
        );
        expect(readMirrorRun(path).run?.attempts).toBe(1);
    });
});

describe('createDumpSource retries', () => {
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' }
        });
    const tokenOk = () => json({ access_token: 't', expires_in: 3600 });
    const source = (fetchFn: typeof fetch) =>
        createDumpSource({
            clientId: 'id',
            clientSecret: 'secret',
            fetchFn,
            retryDelaysMs: [1, 1],
            sleep: async () => {}
        });
    const calls = (fn: ReturnType<typeof vi.fn>, part: string) =>
        fn.mock.calls.filter((c) => String(c[0]).includes(part)).length;

    it('retries a 503 and a network error, then returns the listing', async () => {
        const fetchFn: ReturnType<typeof vi.fn> = vi.fn(
            async (url: RequestInfo | URL): Promise<Response> => {
                const u = String(url);
                if (u.includes('oauth2')) return tokenOk();
                if (calls(fetchFn, '/v4/dumps') === 1) return new Response('', { status: 503 });
                if (calls(fetchFn, '/v4/dumps') === 2) throw new TypeError('fetch failed');
                return json([{ endpoint: 'games', file_name: '1_games.csv', updated_at: 1 }]);
            }
        );
        const list = await source(fetchFn as unknown as typeof fetch).list();
        expect(list).toEqual([{ endpoint: 'games', fileName: '1_games.csv', updatedAt: 1 }]);
        expect(calls(fetchFn, '/v4/dumps')).toBe(3);
    });

    it('gives up after the last try with a retryable error', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL): Promise<Response> =>
            String(url).includes('oauth2') ? tokenOk() : new Response('', { status: 502 })
        );
        const error = await source(fetchFn as unknown as typeof fetch)
            .list()
            .catch((e) => e);
        expect(error.message).toBe('Listing IGDB dumps failed (502)');
        expect(error).not.toBeInstanceOf(PermanentMirrorError);
        expect(calls(fetchFn, '/v4/dumps')).toBe(3);
    });

    it('treats 401, 403 and 404 as permanent and does not retry them', async () => {
        for (const status of [401, 403, 404]) {
            const fetchFn = vi.fn(async (url: RequestInfo | URL): Promise<Response> =>
                String(url).includes('oauth2') ? tokenOk() : new Response('', { status })
            );
            const error = await source(fetchFn as unknown as typeof fetch)
                .open('games')
                .catch((e) => e);
            expect(error).toBeInstanceOf(PermanentMirrorError);
            expect(error.message).toBe(`Dump games is not available (${status})`);
            expect(calls(fetchFn, '/v4/dumps')).toBe(1);
        }
    });

    it('treats a refused client secret as permanent, and a Twitch outage as retryable', async () => {
        const refused = vi.fn(async () => new Response('', { status: 400 }));
        const error = await source(refused as unknown as typeof fetch)
            .list()
            .catch((e) => e);
        expect(error).toBeInstanceOf(PermanentMirrorError);
        expect(error.message).toBe('Twitch token request failed (400)');
        expect(refused).toHaveBeenCalledTimes(1);

        const down = vi.fn(async () => new Response('', { status: 503 }));
        const outage = await source(down as unknown as typeof fetch)
            .list()
            .catch((e) => e);
        expect(outage).not.toBeInstanceOf(PermanentMirrorError);
    });

    it('does not retry the whole job for a refused client secret', async () => {
        const waits: number[] = [];
        const run = await job({
            source: source(
                vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof fetch
            ),
            retryDelaysMs: [60_000, 300_000],
            sleep: async (ms) => {
                waits.push(ms);
            }
        });
        expect(run).toMatchObject({
            ok: false,
            attempts: 1,
            error: 'Twitch token request failed (400)'
        });
        expect(waits).toEqual([]);
    });

    it('retries the download itself and streams the file', async () => {
        const fetchFn: ReturnType<typeof vi.fn> = vi.fn(
            async (url: RequestInfo | URL): Promise<Response> => {
                const u = String(url);
                if (u.includes('oauth2')) return tokenOk();
                if (u.includes('/v4/dumps/games'))
                    return json({ s3_url: 'https://s3.example/games.csv' });
                return calls(fetchFn, 's3.example') === 1
                    ? new Response('', { status: 500 })
                    : new Response('id,name\n1,Hades\n');
            }
        );
        const stream = await source(fetchFn as unknown as typeof fetch).open('games');
        let text = '';
        for await (const chunk of stream) text += chunk;
        expect(text).toBe('id,name\n1,Hades\n');
        expect(calls(fetchFn, 's3.example')).toBe(2);
    });
});
