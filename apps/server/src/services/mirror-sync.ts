import { isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { games, series } from '../db/schema.js';
import type { IgdbClient, LocalIgdb } from '../igdb/types.js';
import { reportError } from './error-log.js';
import { saveGame, upsertPlatforms } from './games.js';
import { saveSeriesMembers } from './series.js';
import { read, write } from './settings.js';

/** Which mirror dump the cached games were last refreshed from. */
export const SYNCED_DUMP = 'igdb_mirror_synced_dump';
/** Games refreshed per transaction; the event loop gets a turn between batches. */
const BATCH = 200;
/** How often the server looks for a newly built mirror. */
export const MIRROR_SYNC_CHECK_MS = 10 * 60 * 1000;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface SyncResult {
    games: number;
    series: number;
}

/**
 * Overwrites cached games with the mirror's copy: names, summaries, release dates, ratings, time to
 * beat, covers, screenshots, platforms, genres, themes and series. Games the mirror doesn't have
 * are left as they are. A full run also refreshes the platform list and the member lists of the
 * series pages already cached; `onlyDue` is for rows saved from an import file, whose metadata
 * is only the file's snapshot (they have no series check yet), and touches just those.
 */
export async function syncCachedGames(
    db: Db,
    /** Asked for again before every batch: a rebuilt mirror may replace (and close) the file between batches */
    getLocal: () => LocalIgdb | null,
    opts: { onlyDue?: boolean; now?: number } = {}
): Promise<SyncResult> {
    const now = opts.now ?? Date.now();
    const ids = db
        .select({ id: games.id })
        .from(games)
        .where(opts.onlyDue ? isNull(games.seriesCheckedAt) : undefined)
        .all()
        .map((g) => g.id);

    let updated = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
        const local = getLocal();
        if (!local) break;
        db.transaction((tx) => {
            for (const id of ids.slice(i, i + BATCH)) {
                const record = local.game(id);
                if (!record) continue;
                saveGame(tx as unknown as Db, record, now, { overwrite: true });
                updated++;
            }
        });
        await yieldToEventLoop();
    }

    let seriesUpdated = 0;
    const local = getLocal();
    if (local && !opts.onlyDue) {
        db.transaction((tx) => upsertPlatforms(tx as unknown as Db, local.platforms()));
        const cachedPages = db
            .select({ id: series.id })
            .from(series)
            .where(isNotNull(series.membersFetchedAt))
            .all();
        for (const { id } of cachedPages) {
            const record = local.seriesRecord(id);
            if (!record) continue;
            saveSeriesMembers(db, record, now);
            seriesUpdated++;
        }
    }
    return { games: updated, series: seriesUpdated };
}

let syncing = false;

/**
 * Refreshes the cached games from the mirror when it has been rebuilt since the last refresh (or
 * never has been). Cheap to call often: it compares one dump name. Best effort: a failure is
 * recorded and the next call tries again.
 */
export async function syncFromMirrorIfNew(
    db: Db,
    igdb: IgdbClient | undefined
): Promise<SyncResult | null> {
    const dump = igdb?.local?.()?.dump();
    if (!igdb?.local || !dump || syncing || read(db, SYNCED_DUMP) === dump) return null;
    syncing = true;
    try {
        const result = await syncCachedGames(db, () => igdb.local!());
        write(db, SYNCED_DUMP, dump);
        console.log(
            `IGDB mirror sync (${dump}): ${result.games} games, ${result.series} series pages`
        );
        return result;
    } catch (e) {
        reportError(db, 'job_mirror_sync', e, { context: { dump } });
        return null;
    } finally {
        syncing = false;
    }
}

/** After an import: games saved from the file take the mirror's metadata at once. */
export async function syncImportedFromMirror(db: Db, igdb: IgdbClient | undefined) {
    if (!igdb?.local?.()) return;
    try {
        await syncCachedGames(db, () => igdb.local!(), { onlyDue: true });
    } catch (e) {
        reportError(db, 'job_mirror_sync', e, { context: { after: 'import' } });
    }
}
