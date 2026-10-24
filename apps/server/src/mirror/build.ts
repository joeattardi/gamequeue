import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { isCollectable, releaseFromFormats } from '../igdb/mappers.js';
import { int, parseIds, readCsv, text, type CsvRow } from './csv.js';
import type { DumpSource } from './dumps.js';
import {
    MAX_MIRROR_SCREENSHOTS,
    MIRROR_DDL,
    MIRROR_FTS_DDL,
    MIRROR_SCHEMA_VERSION,
    STAGING_DDL,
    STAGING_INDEX_DDL
} from './schema.js';

export interface BuildOptions {
    source: DumpSource;
    /** The file to create (any existing file is replaced); a scratch `<outPath>.staging` sits beside it */
    outPath: string;
    /** Extra rows for the `meta` table, e.g. which dump this was built from */
    meta?: Record<string, string>;
    log?: (message: string) => void;
    now?: () => number;
}

export interface BuildStats {
    games: number;
    searchable: number;
    platforms: number;
    genres: number;
    themes: number;
    series: number;
    seconds: number;
}

const rmDb = (path: string) => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(path + suffix, { force: true });
};

/**
 * Builds the mirror from the dumps, streaming each CSV straight into SQLite. The small lookup dumps
 * go in first, the ones that only feed columns of `games` (covers, screenshots, time to beat,
 * release dates) are staged in a scratch file, and `games` last. Nothing is validated here; see
 * `verifyMirror`. A failure leaves no usable file behind.
 */
export async function buildMirror(opts: BuildOptions): Promise<BuildStats> {
    const log = opts.log ?? (() => {});
    const now = opts.now ?? Date.now;
    const started = now();
    const stagingPath = `${opts.outPath}.staging`;
    rmDb(opts.outPath);
    rmDb(stagingPath);

    const db = new Database(opts.outPath);
    try {
        // A rebuild from scratch: if it dies we throw the file away, so no journal or fsync is needed
        db.pragma('journal_mode = OFF');
        db.pragma('synchronous = OFF');
        db.exec(MIRROR_DDL);
        db.prepare('ATTACH DATABASE ? AS stg').run(stagingPath);
        db.exec(STAGING_DDL);

        /** Streams one dump into `handle` inside a single transaction. */
        const ingest = async (endpoint: string, handle: (row: CsvRow) => void) => {
            const t = now();
            let rows = 0;
            db.exec('BEGIN');
            try {
                for await (const row of readCsv(await opts.source.open(endpoint))) {
                    handle(row);
                    rows++;
                }
                db.exec('COMMIT');
            } catch (e) {
                db.exec('ROLLBACK');
                throw e;
            }
            log(`${endpoint}: ${rows} rows in ${((now() - t) / 1000).toFixed(1)}s`);
        };

        // Lookups
        const insertPlatform = db.prepare(
            'INSERT OR REPLACE INTO platforms (id, name, abbreviation) VALUES (?, ?, ?)'
        );
        await ingest('platforms', (r) => {
            const id = int(r.id);
            if (id !== null && r.name) insertPlatform.run(id, r.name, text(r.abbreviation));
        });
        for (const table of ['genres', 'themes'] as const) {
            const insert = db.prepare(`INSERT OR REPLACE INTO ${table} (id, name) VALUES (?, ?)`);
            await ingest(table, (r) => {
                const id = int(r.id);
                if (id !== null && r.name) insert.run(id, r.name);
            });
        }
        const insertSeries = db.prepare('INSERT OR REPLACE INTO series (id, name) VALUES (?, ?)');
        await ingest('collections', (r) => {
            const id = int(r.id);
            if (id !== null && r.name) insertSeries.run(id, r.name);
        });
        const gameTypes = new Map<number, string>();
        await ingest('game_types', (r) => {
            const id = int(r.id);
            if (id !== null && r.type) gameTypes.set(id, r.type);
        });

        // Staged: only used to fill columns of `games`
        const stageCover = db.prepare('INSERT OR REPLACE INTO stg.covers VALUES (?, ?)');
        await ingest('covers', (r) => {
            const id = int(r.id);
            if (id !== null && r.image_id) stageCover.run(id, r.image_id);
        });
        const stageShot = db.prepare('INSERT OR REPLACE INTO stg.screenshots VALUES (?, ?)');
        await ingest('screenshots', (r) => {
            const id = int(r.id);
            if (id !== null && r.image_id) stageShot.run(id, r.image_id);
        });
        // A game can have several rows; like the live query, the first one wins
        const stageTtb = db.prepare('INSERT OR IGNORE INTO stg.ttb VALUES (?, ?, ?, ?, ?)');
        await ingest('game_time_to_beats', (r) => {
            const id = int(r.game_id);
            if (id !== null)
                stageTtb.run(id, int(r.hastily), int(r.normally), int(r.completely), int(r.count));
        });
        const stageDate = db.prepare('INSERT INTO stg.release_dates VALUES (?, ?, ?)');
        await ingest('release_dates', (r) => {
            const game = int(r.game);
            if (game !== null && r.date) stageDate.run(game, r.date, int(r.date_format));
        });
        const stageAlt = db.prepare('INSERT INTO stg.alt_names VALUES (?, ?)');
        await ingest('alternative_names', (r) => {
            const game = int(r.game);
            if (game !== null && r.name) stageAlt.run(game, r.name);
        });
        db.exec(STAGING_INDEX_DDL);

        // Games
        const coverOf = db.prepare('SELECT image_id FROM stg.covers WHERE id = ?').pluck();
        const shotOf = db.prepare('SELECT image_id FROM stg.screenshots WHERE id = ?').pluck();
        const ttbOf = db.prepare('SELECT * FROM stg.ttb WHERE game_id = ?');
        const formatsOf = db
            .prepare('SELECT format FROM stg.release_dates WHERE game = ? AND date = ?')
            .pluck();
        const insertGame = db.prepare(
            `INSERT OR REPLACE INTO games (
                id, name, slug, summary, release_date, release_precision, cover_image_id, screenshots,
                igdb_rating, igdb_rating_count, game_type_id, game_type, is_edition, searchable,
                ttb_hastily_s, ttb_normally_s, ttb_completely_s, ttb_count, similar_games
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const joins = {
            platform: db.prepare('INSERT OR IGNORE INTO game_platforms VALUES (?, ?)'),
            genre: db.prepare('INSERT OR IGNORE INTO game_genres VALUES (?, ?)'),
            theme: db.prepare('INSERT OR IGNORE INTO game_themes VALUES (?, ?)'),
            series: db.prepare('INSERT OR IGNORE INTO game_series VALUES (?, ?)')
        };
        await ingest('games', (r) => {
            const id = int(r.id);
            if (id === null || !r.name) return;
            const typeId = int(r.game_type);
            const type = typeId === null ? null : (gameTypes.get(typeId) ?? null);
            const isEdition = r.version_parent !== '';
            const searchable =
                !isEdition && isCollectable({ game_type: { type: type ?? undefined } });

            // `first_release_date` is "YYYY-MM-DD hh:mm:ss" in UTC; the per-platform dates use the
            // same text, so the ones that carry the first date can be matched by equality
            const first = text(r.first_release_date);
            const release = releaseFromFormats(
                first ? first.slice(0, 10) : null,
                first
                    ? (formatsOf.all(id, first) as (number | null)[]).map((f) => f ?? undefined)
                    : []
            );

            const shots: string[] = [];
            for (const sid of parseIds(r.screenshots)) {
                if (shots.length >= MAX_MIRROR_SCREENSHOTS) break;
                const image = shotOf.get(sid) as string | undefined;
                if (image) shots.push(image);
            }
            const cover = int(r.cover);
            const ttb = ttbOf.get(id) as
                | {
                      hastily: number | null;
                      normally: number | null;
                      completely: number | null;
                      count: number | null;
                  }
                | undefined;
            const hasTtb = ttb && (ttb.hastily || ttb.normally || ttb.completely);
            const similar = parseIds(r.similar_games);

            insertGame.run(
                id,
                r.name,
                text(r.slug),
                text(r.summary),
                release.releaseDate,
                release.releasePrecision,
                cover === null ? null : ((coverOf.get(cover) as string | undefined) ?? null),
                JSON.stringify(shots),
                int(r.total_rating),
                int(r.total_rating_count),
                typeId,
                type,
                isEdition ? 1 : 0,
                searchable ? 1 : 0,
                hasTtb ? ttb.hastily : null,
                hasTtb ? ttb.normally : null,
                hasTtb ? ttb.completely : null,
                hasTtb ? (ttb.count ?? 0) : null,
                similar.length ? JSON.stringify(similar) : null
            );
            for (const p of parseIds(r.platforms)) joins.platform.run(id, p);
            for (const g of parseIds(r.genres)) joins.genre.run(id, g);
            for (const t of parseIds(r.themes)) joins.theme.run(id, t);
            for (const s of parseIds(r.collections)) joins.series.run(id, s);
        });

        const t = now();
        db.exec(MIRROR_FTS_DDL);
        log(`search index built in ${((now() - t) / 1000).toFixed(1)}s`);

        const count = (sql: string) => (db.prepare(sql).pluck().get() as number) ?? 0;
        const stats: BuildStats = {
            games: count('SELECT count(*) FROM games'),
            searchable: count('SELECT count(*) FROM games WHERE searchable = 1'),
            platforms: count('SELECT count(*) FROM platforms'),
            genres: count('SELECT count(*) FROM genres'),
            themes: count('SELECT count(*) FROM themes'),
            series: count('SELECT count(*) FROM series'),
            seconds: 0
        };
        stats.seconds = (now() - started) / 1000;

        const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
        const meta = {
            schema_version: String(MIRROR_SCHEMA_VERSION),
            built_at: String(Math.floor(now() / 1000)),
            games: String(stats.games),
            searchable: String(stats.searchable),
            ...opts.meta
        };
        for (const [k, v] of Object.entries(meta)) setMeta.run(k, v);

        db.exec('DETACH DATABASE stg');
        db.close();
        return stats;
    } catch (e) {
        if (db.open) db.close();
        rmDb(opts.outPath);
        throw e;
    } finally {
        rmDb(stagingPath);
    }
}
