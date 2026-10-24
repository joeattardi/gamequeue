import { readFileSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mirrorRunSchema, type MirrorRunDto } from '@gamequeue/shared';

/** The job's report sits next to the mirror file, so it is in the mounted `/data` in Docker. */
export const mirrorStatusPath = (mirrorPath: string) =>
    join(dirname(mirrorPath), 'mirror-status.json');

/**
 * Free space an import needs on the mirror's disk. Measured: the new file plus its scratch
 * database peak at about 320 MB while the 250 MB current file is still in place, so this is about
 * twice what is really used.
 */
export const MIN_FREE_BYTES = 1024 ** 3;

export type ReadRun = { run: MirrorRunDto | null; unreadable: boolean };

/** The last report. A missing file means the job has never run; bad content is `unreadable`. */
export function readMirrorRun(mirrorPath: string): ReadRun {
    let raw: string;
    try {
        raw = readFileSync(mirrorStatusPath(mirrorPath), 'utf8');
    } catch (err) {
        return { run: null, unreadable: (err as NodeJS.ErrnoException).code !== 'ENOENT' };
    }
    try {
        const parsed = mirrorRunSchema.safeParse(JSON.parse(raw));
        return parsed.success
            ? { run: parsed.data, unreadable: false }
            : { run: null, unreadable: true };
    } catch {
        return { run: null, unreadable: true };
    }
}

/** Atomic, so the app never reads half a file. */
export function writeMirrorRun(mirrorPath: string, run: MirrorRunDto) {
    const path = mirrorStatusPath(mirrorPath);
    writeFileSync(`${path}.tmp`, `${JSON.stringify(run)}\n`);
    renameSync(`${path}.tmp`, path);
}

/** Throws before anything is downloaded if the disk can't hold an import. */
export function assertFreeSpace(dir: string, minBytes = MIN_FREE_BYTES) {
    const s = statfsSync(dir);
    const free = s.bavail * s.bsize;
    if (free < minBytes) {
        const mb = (n: number) => Math.round(n / 1024 ** 2);
        throw new Error(
            `Only ${mb(free)} MB free in ${dir}; the import needs at least ${mb(minBytes)} MB`
        );
    }
}
