import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorEvents, users } from '../src/db/schema.js';
import { openDb } from '../src/db/client.js';
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
    runMirrorJob({ source: fakeSource(), path, minGames: 1, ...over });

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
        expect(status).toEqual({ mirror: null, run: null, runUnreadable: false, syncedDump: null });
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
