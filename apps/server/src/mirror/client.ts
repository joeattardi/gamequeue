import Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import type { IgdbClient } from '../igdb/types.js';
import { MirrorReader } from './reader.js';
import { MIRROR_SCHEMA_VERSION } from './schema.js';

/** How often the file is checked for being replaced by a newer build. */
const CHECK_EVERY_MS = 5_000;

/**
 * The open mirror file. The daily build replaces it by rename, so this notices a new file (by inode,
 * size and mtime) and switches to it without a restart. Null when there is no usable file.
 */
export class MirrorHandle {
    private reader: MirrorReader | null = null;
    private db: Database.Database | null = null;
    private seen = '';
    private checkedAt = -Infinity;

    constructor(
        private path: string,
        private opts: {
            checkEveryMs?: number;
            now?: () => number;
            warn?: (message: string) => void;
        } = {}
    ) {}

    get(): MirrorReader | null {
        const now = (this.opts.now ?? Date.now)();
        if (now - this.checkedAt < (this.opts.checkEveryMs ?? CHECK_EVERY_MS)) return this.reader;
        this.checkedAt = now;

        let signature = '';
        try {
            const s = statSync(this.path);
            signature = `${s.ino}:${s.size}:${s.mtimeMs}`;
        } catch {
            // No file (not built yet, or removed): behave as if there is no mirror
        }
        if (signature === this.seen) return this.reader;
        this.seen = signature;
        this.close();
        if (signature) this.open();
        return this.reader;
    }

    close() {
        this.db?.close();
        this.db = null;
        this.reader = null;
    }

    private open() {
        const warn = this.opts.warn ?? ((m: string) => console.warn(m));
        try {
            const db = new Database(this.path, { readonly: true, fileMustExist: true });
            const reader = new MirrorReader(db);
            const version = Number(reader.meta().schema_version ?? 0);
            if (version !== MIRROR_SCHEMA_VERSION) {
                db.close();
                warn(
                    `IGDB mirror ${this.path} has schema version ${version}, expected ${MIRROR_SCHEMA_VERSION}: ignoring it (rebuild with npm run igdb:mirror -- --force)`
                );
                return;
            }
            this.db = db;
            this.reader = reader;
        } catch (e) {
            warn(`IGDB mirror ${this.path} could not be opened: ${(e as Error).message}`);
        }
    }
}

/**
 * An `IgdbClient` that answers from the local mirror and asks the live client (when there is one)
 * only for what the mirror can't answer: a game newer than the last dump, a search with no local hit
 * (which also covers typos, since IGDB's own search is typo-tolerant), or no mirror file at all.
 * The calls that report on the live connection (`status`, `ping`) belong to the live client.
 */
export function createMirrorIgdbClient(opts: {
    path: string;
    fallback?: IgdbClient;
    handle?: MirrorHandle;
}): IgdbClient {
    const handle = opts.handle ?? new MirrorHandle(opts.path);
    const { fallback } = opts;

    /** Ids the local answer didn't cover, asked of the live client when there is one. */
    const rest = async <T extends { id: number }>(
        ids: number[],
        local: T[],
        ask: (client: IgdbClient, ids: number[]) => Promise<T[]>
    ): Promise<T[]> => {
        const known = new Set(local.map((r) => r.id));
        const missing = ids.filter((id) => !known.has(id));
        return fallback && missing.length ? [...local, ...(await ask(fallback, missing))] : local;
    };

    return {
        ...(fallback?.status && { status: () => fallback.status!() }),
        ...(fallback?.ping && { ping: () => fallback.ping!() }),
        local: () => handle.get(),

        async search(query) {
            const hits = handle.get()?.search(query) ?? [];
            if (hits.length || !fallback) return hits;
            return fallback.search(query);
        },

        async fetchGame(igdbId) {
            return handle.get()?.game(igdbId) ?? (fallback ? fallback.fetchGame(igdbId) : null);
        },

        async fetchPlatforms() {
            const local = handle.get()?.platforms() ?? [];
            if (local.length || !fallback) return local;
            return fallback.fetchPlatforms();
        },

        async fetchReleaseDates(igdbIds) {
            const local = handle.get()?.releaseInfo(igdbIds) ?? [];
            return rest(igdbIds, local, (c, ids) => c.fetchReleaseDates(ids));
        },

        async fetchGameSeries(igdbIds) {
            const local = handle.get()?.gameSeries(igdbIds) ?? [];
            return rest(igdbIds, local, (c, ids) => c.fetchGameSeries(ids));
        },

        async fetchScreenshots(igdbId) {
            const local = handle.get()?.screenshots(igdbId) ?? null;
            return local ?? (fallback ? fallback.fetchScreenshots(igdbId) : null);
        },

        async fetchSeries(seriesId) {
            const local = handle.get()?.seriesRecord(seriesId) ?? null;
            return local ?? (fallback ? fallback.fetchSeries(seriesId) : null);
        },

        async fetchSimilarGames(igdbId) {
            const local = handle.get()?.similar(igdbId) ?? null;
            return local ?? (fallback ? fallback.fetchSimilarGames(igdbId) : []);
        }
    };
}
