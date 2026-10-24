import { dirname } from 'node:path';
import type { MirrorRunDto } from '@gamequeue/shared';
import type { DumpSource } from './dumps.js';
import { runMirror } from './run.js';
import { assertFreeSpace, MIN_FREE_BYTES, readMirrorRun, writeMirrorRun } from './status.js';

export interface JobOptions {
    source: DumpSource;
    path: string;
    force?: boolean;
    minGames?: number;
    /** Free space required before a build starts (default `MIN_FREE_BYTES`) */
    minFreeBytes?: number;
    log?: (message: string) => void;
    now?: () => number;
}

/**
 * One run of the daily job: brings the mirror up to date and writes `mirror-status.json` whatever
 * happens (built, already current, or failed with the reason). Never throws; the caller turns
 * `ok: false` into a non-zero exit code. A failed run keeps the time of the last good one.
 */
export async function runMirrorJob(opts: JobOptions): Promise<MirrorRunDto> {
    const now = opts.now ?? Date.now;
    const started = now();
    const previous = readMirrorRun(opts.path).run;

    const finish = (
        outcome: Pick<MirrorRunDto, 'ok' | 'error' | 'result' | 'dump'>
    ): MirrorRunDto => {
        const at = now();
        const run: MirrorRunDto = {
            ...outcome,
            lastRunAt: at,
            lastSuccessAt: outcome.ok ? at : (previous?.lastSuccessAt ?? null),
            seconds: Math.round((at - started) / 100) / 10
        };
        try {
            writeMirrorRun(opts.path, run);
        } catch (e) {
            opts.log?.(`could not write the status file: ${(e as Error).message}`);
        }
        return run;
    };

    try {
        const result = await runMirror({
            source: opts.source,
            path: opts.path,
            force: opts.force,
            minGames: opts.minGames,
            beforeBuild: () =>
                assertFreeSpace(dirname(opts.path), opts.minFreeBytes ?? MIN_FREE_BYTES),
            log: opts.log
        });
        return finish({ ok: true, error: null, result: result.status, dump: result.dump });
    } catch (e) {
        return finish({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            result: null,
            dump: null
        });
    }
}
