import { statSync } from 'node:fs';
import { dumpTime, type MirrorStatusDto } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { readMirrorInfo } from '../mirror/run.js';
import { MIRROR_SCHEMA_VERSION } from '../mirror/schema.js';
import { readMirrorRun } from '../mirror/status.js';
import { reportError } from './error-log.js';
import { SYNCED_DUMP } from './mirror-sync.js';
import { read, write } from './settings.js';

/** The `lastRunAt` of the newest failed run already in the error log, so each failure is recorded once. */
const FAILURE_REPORTED = 'igdb_mirror_failure_reported_at';

/** What the admin page shows: the mirror file, the daily job's last report, and the cache sync. */
export function getMirrorStatus(db: Db, config: Config): MirrorStatusDto {
    const info = readMirrorInfo(config.igdbMirrorPath);
    const usable = info?.schemaVersion === MIRROR_SCHEMA_VERSION ? info : null;
    const { run, unreadable } = readMirrorRun(config.igdbMirrorPath);
    let sizeBytes = 0;
    try {
        sizeBytes = statSync(config.igdbMirrorPath).size;
    } catch {
        // gone between the two reads: reported as missing on the next one
    }
    return {
        mirror: usable && {
            builtAt: usable.builtAt === null ? null : usable.builtAt * 1000,
            dump: usable.dump,
            dumpAt: dumpTime(usable.dump),
            games: usable.games,
            searchable: usable.searchable,
            sizeBytes
        },
        run,
        runUnreadable: unreadable,
        syncedDump: read(db, SYNCED_DUMP) ?? null
    };
}

/**
 * Puts a failed daily run into the error log (and so the owner alert) once. The job runs in
 * another process and can't reach the database, so the server reads its report on a timer.
 */
export function reportMirrorRunFailure(db: Db, config: Config) {
    const { run } = readMirrorRun(config.igdbMirrorPath);
    if (!run || run.ok || Number(read(db, FAILURE_REPORTED) ?? 0) >= run.lastRunAt) return;
    write(db, FAILURE_REPORTED, String(run.lastRunAt));
    reportError(db, 'job_mirror_build', new Error(run.error ?? 'The mirror job failed'), {
        context: { lastRunAt: run.lastRunAt }
    });
}
