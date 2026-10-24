import Database from 'better-sqlite3';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildMirror, type BuildStats } from './build.js';
import { PermanentMirrorError } from './errors.js';
import type { DumpSource } from './dumps.js';
import { MIRROR_SCHEMA_VERSION } from './schema.js';

/** Every dump the mirror reads. */
export const MIRROR_ENDPOINTS = [
    'games',
    'covers',
    'screenshots',
    'game_time_to_beats',
    'release_dates',
    'alternative_names',
    'platforms',
    'genres',
    'themes',
    'collections',
    'game_types'
] as const;

/** A new mirror with fewer games than this is taken for a truncated dump and rejected. */
export const MIN_GAMES = 100_000;
/** ...as is one that lost more than this share of the current mirror's games. */
export const MAX_SHRINK = 0.2;

export interface MirrorInfo {
    schemaVersion: number;
    dump: string | null;
    /** Epoch seconds */
    builtAt: number | null;
    games: number;
    searchable: number;
}

/** What a mirror file says about itself, or null when it's missing or unreadable. */
export function readMirrorInfo(path: string): MirrorInfo | null {
    if (!existsSync(path)) return null;
    let db: Database.Database | undefined;
    try {
        db = new Database(path, { readonly: true });
        const rows = db.prepare('SELECT key, value FROM meta').all() as {
            key: string;
            value: string;
        }[];
        const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        return {
            schemaVersion: Number(meta.schema_version ?? 0),
            dump: meta.dump ?? null,
            builtAt: meta.built_at ? Number(meta.built_at) : null,
            games: Number(meta.games ?? 0),
            searchable: Number(meta.searchable ?? 0)
        };
    } catch {
        return null;
    } finally {
        db?.close();
    }
}

/** Throws unless the freshly built file looks like a complete mirror. */
export function verifyMirror(path: string, opts: { minGames: number; previousGames?: number }) {
    const db = new Database(path, { readonly: true });
    try {
        const check = db.pragma('quick_check', { simple: true });
        if (check !== 'ok') throw new Error(`Mirror failed the integrity check: ${check}`);
        const games = db.prepare('SELECT count(*) FROM games').pluck().get() as number;
        if (games < opts.minGames)
            throw new PermanentMirrorError(
                `Mirror has only ${games} games (expected at least ${opts.minGames})`
            );
        if (opts.previousGames && games < opts.previousGames * (1 - MAX_SHRINK))
            throw new PermanentMirrorError(
                `Mirror shrank from ${opts.previousGames} to ${games} games; keeping the old one`
            );
        const searchable = db
            .prepare('SELECT count(*) FROM games WHERE searchable = 1')
            .pluck()
            .get() as number;
        // Count the documents the index holds (`games_fts` itself can't answer count(*))
        const indexed = db
            .prepare('SELECT count(*) FROM games_fts_docsize')
            .pluck()
            .get() as number;
        if (indexed !== searchable)
            throw new PermanentMirrorError(
                `Search index has ${indexed} rows for ${searchable} searchable games`
            );
    } finally {
        db.close();
    }
}

export interface RunOptions {
    source: DumpSource;
    /** Where the live mirror lives; replaced atomically on success */
    path: string;
    /** Rebuild even when the dumps haven't changed since the last build */
    force?: boolean;
    minGames?: number;
    /** Called once a build is going to happen (not when the mirror is current); throw to stop it */
    beforeBuild?: () => void;
    log?: (message: string) => void;
}

export type RunResult =
    { status: 'current'; dump: string } | { status: 'built'; dump: string; stats: BuildStats };

/** fsync a file (or, best effort, a directory so a rename is durable too). */
function syncToDisk(path: string, bestEffort = false) {
    try {
        const fd = openSync(path, bestEffort ? 'r' : 'r+');
        try {
            fsyncSync(fd);
        } finally {
            closeSync(fd);
        }
    } catch (e) {
        if (!bestEffort) throw e;
    }
}

/**
 * Brings the mirror at `path` up to date: skips when the games dump is the one it was built from,
 * otherwise builds a new file beside it, verifies it and renames it into place. The old mirror
 * stays untouched until the new one has passed, so a failed or partial run changes nothing.
 */
export async function runMirror(opts: RunOptions): Promise<RunResult> {
    const log = opts.log ?? (() => {});
    const listing = await opts.source.list();
    for (const endpoint of MIRROR_ENDPOINTS)
        if (!listing.some((d) => d.endpoint === endpoint))
            throw new PermanentMirrorError(`IGDB does not list a dump for "${endpoint}"`);
    const dump = listing.find((d) => d.endpoint === 'games')!.fileName;

    const current = readMirrorInfo(opts.path);
    const usable = current?.schemaVersion === MIRROR_SCHEMA_VERSION ? current : null;
    if (usable?.dump === dump && !opts.force) {
        log(`Mirror is already built from ${dump}; nothing to do`);
        return { status: 'current', dump };
    }

    mkdirSync(dirname(opts.path), { recursive: true });
    opts.beforeBuild?.();
    const next = `${opts.path}.new`;
    try {
        const stats = await buildMirror({
            source: opts.source,
            outPath: next,
            meta: { dump },
            log
        });
        verifyMirror(next, {
            minGames: opts.minGames ?? MIN_GAMES,
            previousGames: usable?.games
        });
        // The build skipped fsync for speed: put the finished file on disk before it replaces the old
        // one, so a power cut right after the rename can't leave a damaged mirror in place
        syncToDisk(next);
        renameSync(next, opts.path);
        syncToDisk(dirname(opts.path), true);
        log(`Mirror replaced: ${stats.games} games (${stats.searchable} searchable)`);
        return { status: 'built', dump, stats };
    } finally {
        rmSync(next, { force: true });
    }
}
