import { statSync } from 'node:fs';
import { lt, notInArray, sql } from 'drizzle-orm';
import type { PurgeSessionsResult, PurgeUnusedGamesResult, VacuumResult } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { gameSeries, games, series, sessions } from '../db/schema.js';

/**
 * Deletes cached games that no collection entry or wishlist item points at, plus series left
 * with no cached game. Nothing a user can see is lost; the games are fetched from IGDB again
 * if someone adds them later. Join rows (platforms, genres, themes, series links) cascade.
 */
export function purgeUnusedGames(db: Db): PurgeUnusedGamesResult {
    return db.transaction((tx) => {
        const deletedGames = tx
            .delete(games)
            .where(
                sql`${games.id} not in (select game_id from entries union select game_id from wishlist_items union select game_id from grid_cells where game_id is not null)`
            )
            .run().changes;
        // Series cascade to series_members; only series nothing links to any more are unreachable
        const deletedSeries = tx
            .delete(series)
            .where(notInArray(series.id, tx.select({ id: gameSeries.seriesId }).from(gameSeries)))
            .run().changes;
        return { deletedGames, deletedSeries };
    });
}

export function purgeExpiredSessionsNow(db: Db): PurgeSessionsResult {
    return { deleted: db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run().changes };
}

const sizeOnDisk = (config: Config) => {
    const size = (p: string) => {
        try {
            return statSync(p).size;
        } catch {
            return 0;
        }
    };
    return size(config.databasePath) + size(`${config.databasePath}-wal`);
};

/**
 * Rewrites the database file without its empty pages. Needs free disk space for a temporary
 * copy and blocks writes while it runs (seconds for a database this size). The log is folded
 * in first and truncated after so the figures reflect the real size.
 */
export function vacuum(db: Db, config: Config): VacuumResult {
    const beforeBytes = sizeOnDisk(config);
    db.run(sql`pragma wal_checkpoint(truncate)`);
    db.run(sql`vacuum`);
    db.run(sql`pragma wal_checkpoint(truncate)`);
    return { beforeBytes, afterBytes: sizeOnDisk(config) };
}
