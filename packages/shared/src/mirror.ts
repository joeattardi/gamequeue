import { z } from 'zod';

/**
 * Written by `npm run igdb:mirror` (the `mirror/cli.ts` entry) to `mirror-status.json` next to the
 * mirror file after every run, whatever the outcome; read by the admin page.
 */
export const mirrorRunSchema = z.object({
    /** When the run finished (epoch ms) */
    lastRunAt: z.number().int(),
    ok: z.boolean(),
    /** What went wrong when `ok` is false */
    error: z.string().nullable(),
    /** `built` = a new mirror replaced the old; `current` = the dumps hadn't changed. Null on failure */
    result: z.enum(['built', 'current']).nullable(),
    /** When a run last succeeded (built or current); kept across failed runs. Null = never */
    lastSuccessAt: z.number().int().nullable(),
    /** The games dump the mirror was built from, e.g. `1792821600_games.csv` */
    dump: z.string().nullable(),
    /** How long the run took, in seconds */
    seconds: z.number().nonnegative().nullable()
});
export type MirrorRunDto = z.infer<typeof mirrorRunSchema>;

/** What the mirror file itself says. */
export interface MirrorFileDto {
    /** When the file was built (epoch ms) */
    builtAt: number | null;
    dump: string | null;
    /** When IGDB generated that dump (epoch ms), from the epoch in the dump's file name */
    dumpAt: number | null;
    games: number;
    searchable: number;
    sizeBytes: number;
}

export interface MirrorStatusDto {
    /** Null when there is no usable mirror file (never built, deleted or an old schema version) */
    mirror: MirrorFileDto | null;
    /** The last run of the daily job; null when it has never reported in */
    run: MirrorRunDto | null;
    /** The status file exists but can't be read */
    runUnreadable: boolean;
    /** The dump the cached games were last refreshed from (see `services/mirror-sync.ts`) */
    syncedDump: string | null;
}

/** The daily job runs once a day; a day and a half before a missing run counts as a problem. */
export const MIRROR_STALE_MS = 36 * 3600 * 1000;

export type MirrorHealth = 'healthy' | 'stale' | 'failed' | 'never' | 'missing';

/** The epoch seconds IGDB puts in front of a dump's file name (`1792821600_games.csv`), as ms. */
export function dumpTime(dump: string | null): number | null {
    const seconds = Number(/^(\d+)_/.exec(dump ?? '')?.[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** Worst problem first: a failed run beats a stale one, which beats a missing file. */
export function mirrorHealth(status: MirrorStatusDto, now: number): MirrorHealth {
    const { run, mirror } = status;
    if (!run) return mirror ? 'stale' : 'never';
    if (!run.ok) return 'failed';
    if (!mirror) return 'missing';
    if (run.lastSuccessAt === null || now - run.lastSuccessAt > MIRROR_STALE_MS) return 'stale';
    return 'healthy';
}
