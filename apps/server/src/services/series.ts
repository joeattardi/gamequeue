import { and, eq, inArray } from 'drizzle-orm';
import type { QueueSeriesResultDto, SeriesDto, SeriesMemberDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import {
    entries,
    gameSeries,
    games,
    listItems,
    lists,
    series,
    seriesMembers,
    wishlistItems,
    wishlists
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient, SeriesRecord } from '../igdb/types.js';
import { reportError } from './error-log.js';
import { callIgdb, requireIgdb } from './games.js';
import { addToList, ensureQueue } from './lists.js';

/** New sequels get announced, so a series' member list is re-read from IGDB after a week. */
export const SERIES_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Replaces a series' cached member list with `record`'s. */
export function saveSeriesMembers(db: Db, record: SeriesRecord, now: number) {
    const id = record.id;
    db.transaction((tx) => {
        tx.insert(series)
            .values({ id, name: record.name, membersFetchedAt: now })
            .onConflictDoUpdate({
                target: series.id,
                set: { name: record.name, membersFetchedAt: now }
            })
            .run();
        tx.delete(seriesMembers).where(eq(seriesMembers.seriesId, id)).run();
        if (record.games.length)
            tx.insert(seriesMembers)
                .values(
                    record.games.map((g) => ({
                        seriesId: id,
                        gameId: g.id,
                        name: g.name,
                        coverImageId: g.coverImageId,
                        releaseDate: g.releaseDate,
                        releasePrecision: g.releasePrecision
                    }))
                )
                .run();
    });
}

/**
 * Makes sure the series' game list is cached and not stale. A failed refresh falls back to what
 * we have; only a series we know nothing about is an error (404 if IGDB has no such series).
 */
async function ensureMembers(db: Db, igdb: IgdbClient | undefined, id: number, now: number) {
    const row = db.select().from(series).where(eq(series.id, id)).get();
    const fresh = row?.membersFetchedAt != null && row.membersFetchedAt > now - SERIES_REFRESH_MS;
    if (fresh) return row;
    let record;
    try {
        record = await callIgdb(() => requireIgdb(igdb).fetchSeries(id));
    } catch (e) {
        if (row?.membersFetchedAt != null) {
            reportError(db, 'series_refresh', e, { context: { seriesId: id } });
            return row;
        }
        throw e;
    }
    if (!record) throw new HttpError(404, 'Series not found');
    saveSeriesMembers(db, record, now);
    return db.select().from(series).where(eq(series.id, id)).get()!;
}

/**
 * A series with its games in release order (undated last): IGDB's list of main entries and
 * remakes, plus any game of the series the user owns or wishlisted, whatever its type.
 */
export async function getSeries(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    id: number,
    now = Date.now()
): Promise<SeriesDto> {
    const row = await ensureMembers(db, igdb, id, now);
    if (!row) throw new HttpError(404, 'Series not found');

    const byGame = new Map<number, Omit<SeriesMemberDto, 'entry' | 'wishlisted'>>();
    for (const m of db.select().from(seriesMembers).where(eq(seriesMembers.seriesId, id)).all())
        byGame.set(m.gameId, {
            igdbId: m.gameId,
            name: m.name,
            coverImageId: m.coverImageId,
            releaseDate: m.releaseDate,
            releasePrecision: m.releasePrecision
        });

    // Games we hold that IGDB files under this series but not among the listed types
    const known = db
        .select({ g: games })
        .from(gameSeries)
        .innerJoin(games, eq(games.id, gameSeries.gameId))
        .where(eq(gameSeries.seriesId, id))
        .all();
    const ids = [...new Set([...byGame.keys(), ...known.map((k) => k.g.id)])];
    const owned = ids.length
        ? db
              .select({ id: entries.id, gameId: entries.gameId, status: entries.status })
              .from(entries)
              .where(and(eq(entries.userId, userId), inArray(entries.gameId, ids)))
              .all()
        : [];
    const wished = new Set(
        ids.length
            ? db
                  .select({ gameId: wishlistItems.gameId })
                  .from(wishlistItems)
                  .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
                  .where(and(eq(wishlists.userId, userId), inArray(wishlistItems.gameId, ids)))
                  .all()
                  .map((w) => w.gameId)
            : []
    );
    const heldIds = new Set([...owned.map((o) => o.gameId), ...wished]);
    for (const { g } of known)
        if (heldIds.has(g.id) && !byGame.has(g.id))
            byGame.set(g.id, {
                igdbId: g.id,
                name: g.name,
                coverImageId: g.coverImageId,
                releaseDate: g.releaseDate,
                releasePrecision: g.releasePrecision
            });

    const queued = new Set(
        db
            .select({ entryId: listItems.entryId })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(and(eq(lists.userId, userId), eq(lists.kind, 'queue')))
            .all()
            .map((q) => q.entryId)
    );
    const entryOf = new Map(owned.map((o) => [o.gameId, o]));
    const members: SeriesMemberDto[] = [...byGame.values()].map((m) => {
        const e = entryOf.get(m.igdbId);
        return {
            ...m,
            entry: e ? { id: e.id, status: e.status, queued: queued.has(e.id) } : null,
            wishlisted: wished.has(m.igdbId)
        };
    });
    members.sort(
        (a, b) =>
            (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999') ||
            a.name.localeCompare(b.name)
    );
    return { id: row.id, name: row.name, members };
}

/**
 * Appends the series' unplayed games you own to the queue, in release order. Games already
 * queued are left where they are, and games you've started or finished aren't queued.
 */
export async function queueSeries(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    id: number
): Promise<QueueSeriesResultDto> {
    const dto = await getSeries(db, igdb, userId, id);
    const todo = dto.members.filter((m) => m.entry?.status === 'unplayed' && !m.entry.queued);
    return db.transaction((tx) => {
        const d = tx as unknown as Db;
        const queue = ensureQueue(d, userId);
        for (const m of todo) addToList(d, userId, queue.id, m.entry!.id);
        return { added: todo.length };
    });
}
