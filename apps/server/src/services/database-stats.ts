import { statSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { DatabaseStatsDto } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';

const fileSize = (path: string) => {
    try {
        return statSync(path).size;
    } catch {
        return 0; // in-memory database, or no WAL file yet
    }
};

/** Runs a query that returns one row of numbers, e.g. `select count(*) as n`. */
const one = <T extends Record<string, number | string | null>>(db: Db, query: string) =>
    db.get<T>(sql.raw(query));
const count = (db: Db, from: string) =>
    one<{ n: number }>(db, `select count(*) as n from ${from}`).n;

/** Table names come from sqlite_master, never from input, but are quoted anyway. */
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function readDatabaseStats(db: Db, config: Config): DatabaseStatsDto {
    const pragma = (name: string) =>
        Object.values(one<Record<string, number>>(db, `pragma ${name}`))[0] ?? 0;
    const fetched = one<{ oldest: number | null; newest: number | null }>(
        db,
        'select min(fetched_at) as oldest, max(fetched_at) as newest from games'
    );
    const avatars = one<{ n: number; bytes: number }>(
        db,
        'select count(*) as n, coalesce(sum(length(data)), 0) as bytes from avatars'
    );

    // dbstat lists every b-tree (tables and indexes) with its pages; fold each index into its table
    const bytesByTable = new Map(
        db
            .all<{ tbl: string; bytes: number }>(
                sql.raw(
                    `select m.tbl_name as tbl, sum(d.pgsize) as bytes
                     from dbstat d join sqlite_master m on m.name = d.name
                     group by m.tbl_name`
                )
            )
            .map((r) => [r.tbl, r.bytes])
    );
    const tables = db
        .all<{ name: string }>(
            sql.raw(
                "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
            )
        )
        .map(({ name }) => ({
            name,
            rows: count(db, q(name)),
            bytes: bytesByTable.get(name) ?? 0
        }))
        .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

    return {
        sqliteVersion: one<{ v: string }>(db, 'select sqlite_version() as v').v,
        storage: {
            fileBytes: fileSize(config.databasePath),
            walBytes: fileSize(`${config.databasePath}-wal`),
            pageSize: pragma('page_size'),
            pageCount: pragma('page_count'),
            freePages: pragma('freelist_count')
        },
        cache: {
            games: count(db, 'games'),
            gamesInUse: one<{ n: number }>(
                db,
                `select count(*) as n from games where id in
                 (select game_id from entries union select game_id from wishlist_items)`
            ).n,
            series: count(db, 'series'),
            unusedSeries: count(db, 'series where id not in (select series_id from game_series)'),
            seriesMembers: count(db, 'series_members'),
            platforms: count(db, 'platforms'),
            genres: count(db, 'genres'),
            themes: count(db, 'themes'),
            oldestFetchedAt: fetched.oldest,
            newestFetchedAt: fetched.newest
        },
        content: {
            users: count(db, 'users'),
            entries: count(db, 'entries'),
            playthroughs: count(db, 'playthroughs'),
            lists: count(db, 'lists'),
            smartLists: count(db, 'smart_lists'),
            wishlistItems: count(db, 'wishlist_items'),
            tags: count(db, 'tags'),
            avatars: avatars.n,
            avatarBytes: avatars.bytes,
            sessions: count(db, 'sessions'),
            expiredSessions: one<{ n: number }>(
                db,
                `select count(*) as n from sessions where expires_at <= ${Date.now()}`
            ).n
        },
        tables
    };
}
