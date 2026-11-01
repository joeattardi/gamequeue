import { and, asc, count, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';
import { FIRST_PAGE } from '@gamequeue/shared';
import type {
    EntryDto,
    ListDetailDto,
    ListItemDto,
    ListSummaryDto,
    PageQuery,
    PatchListInput
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, games, listItems, lists } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { IgdbClient } from '../igdb/types.js';
import { forgetSubject, recordActivity } from './activity.js';
import { hydrate } from './entries.js';
import { ensureGame, existingPlatformIds, loadGames } from './games.js';
import { moveInOrder } from './order.js';

function requireList(db: Db, userId: number, id: number) {
    const list = db
        .select()
        .from(lists)
        .where(and(eq(lists.id, id), eq(lists.userId, userId)))
        .get();
    if (!list) throw new HttpError(404, 'List not found');
    return list;
}

type SpecialKind = 'queue' | 'wishlist';

/** The user's one list of a special kind, if they have it yet. Read-only: nothing is created. */
export const findSpecialList = (db: Db, userId: number, kind: SpecialKind) =>
    db
        .select()
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, kind)))
        .get();

/** The user's queue or wishlist, created the first time it's needed. */
function ensureSpecialList(db: Db, userId: number, kind: SpecialKind, name: string) {
    return (
        findSpecialList(db, userId, kind) ??
        db.insert(lists).values({ userId, name, kind }).onConflictDoNothing().returning().get() ??
        findSpecialList(db, userId, kind)!
    );
}

export const ensureQueue = (db: Db, userId: number) =>
    ensureSpecialList(db, userId, 'queue', 'Queue');
export const ensureWishlist = (db: Db, userId: number) =>
    ensureSpecialList(db, userId, 'wishlist', 'Wishlist');
export const findWishlist = (db: Db, userId: number) => findSpecialList(db, userId, 'wishlist');

export function getQueue(db: Db, userId: number, page?: PageQuery): ListDetailDto {
    return getList(db, userId, ensureQueue(db, userId).id, page);
}

function assertPlainList(list: { kind: string }, action: string) {
    if (list.kind === 'queue') throw new HttpError(400, `The queue can't be ${action}`);
    if (list.kind === 'wishlist') throw new HttpError(400, `The wishlist can't be ${action}`);
}

/** How many covers a list tile shows. */
const TILE_COVERS = 4;

export function listLists(db: Db, userId: number): ListSummaryDto[] {
    const rows = db
        .select({
            id: lists.id,
            name: lists.name,
            count: sql<number>`(select count(*) from ${listItems} where ${listItems.listId} = ${lists.id})`
        })
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'list')))
        .orderBy(asc(sql`lower(${lists.name})`), asc(lists.id))
        .all();
    const covers = new Map<number, string[]>();
    const items = db
        .select({ listId: listItems.listId, coverImageId: games.coverImageId })
        .from(listItems)
        .innerJoin(lists, eq(lists.id, listItems.listId))
        .innerJoin(games, eq(games.id, listItems.gameId))
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'list'), isNotNull(games.coverImageId)))
        .orderBy(asc(listItems.listId), asc(listItems.position))
        .all();
    for (const { listId, coverImageId } of items) {
        const have = covers.get(listId) ?? [];
        if (have.length < TILE_COVERS && coverImageId) have.push(coverImageId);
        covers.set(listId, have);
    }
    return rows.map((r) => ({ ...r, covers: covers.get(r.id) ?? [] }));
}

const CHUNK = 500;

/**
 * The items for these games, in the order given: the collection entry where the user owns the
 * game, just the cached game where they don't.
 */
export function itemsFor(db: Db, userId: number, gameIds: number[]): ListItemDto[] {
    const owned = new Map<number, EntryDto>();
    for (let i = 0; i < gameIds.length; i += CHUNK) {
        const chunk = gameIds.slice(i, i + CHUNK);
        const rows = db
            .select({ id: entries.id, gameId: entries.gameId })
            .from(entries)
            .where(and(eq(entries.userId, userId), inArray(entries.gameId, chunk)))
            .all();
        for (const dto of hydrate(
            db,
            userId,
            rows.map((r) => r.id)
        ))
            owned.set(dto.game.id, dto);
    }
    const unowned = loadGames(
        db,
        gameIds.filter((id) => !owned.has(id))
    );
    return gameIds.flatMap((igdbId) => {
        const entry = owned.get(igdbId) ?? null;
        const game = entry?.game ?? unowned.get(igdbId);
        return game ? [{ igdbId, game, entry }] : [];
    });
}

/** One page of a list in list order, or all of it when `page` is omitted (server-side callers). */
export function getList(db: Db, userId: number, id: number, page?: PageQuery): ListDetailDto {
    const list = requireList(db, userId, id);
    const total = db.select({ n: count() }).from(listItems).where(eq(listItems.listId, id)).get()!
        .n;
    const query = db
        .select({ gameId: listItems.gameId })
        .from(listItems)
        .where(eq(listItems.listId, id))
        .orderBy(asc(listItems.position));
    const ids = (page ? query.limit(page.limit).offset(page.offset) : query)
        .all()
        .map((r) => r.gameId);
    return {
        id: list.id,
        name: list.name,
        kind: list.kind,
        description: list.description,
        items: itemsFor(db, userId, ids),
        total
    };
}

export function createList(db: Db, userId: number, name: string, description = ''): ListSummaryDto {
    const row = db.transaction((tx) => {
        const created = tx.insert(lists).values({ userId, name, description }).returning().get();
        recordActivity(tx as unknown as Db, userId, {
            type: 'list',
            subjectId: created.id,
            subjectName: name
        });
        return created;
    });
    return { id: row.id, name: row.name, count: 0, covers: [] };
}

/** Renames and/or re-describes a list; fields left out stay as they are. */
export function updateList(db: Db, userId: number, id: number, patch: PatchListInput) {
    assertPlainList(requireList(db, userId, id), 'renamed or described');
    db.update(lists).set(patch).where(eq(lists.id, id)).run();
}

export function deleteList(db: Db, userId: number, id: number) {
    assertPlainList(requireList(db, userId, id), 'deleted');
    db.transaction((tx) => {
        tx.delete(lists).where(eq(lists.id, id)).run();
        forgetSubject(tx as unknown as Db, userId, ['list'], id);
    });
}

const owns = (db: Db, userId: number, gameId: number) =>
    !!db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.gameId, gameId)))
        .get();

/** The wishlist's per-game extras: the platform the user means to buy it on, and a private note. */
export interface ListItemExtras {
    platformId?: number | null;
    note?: string;
}

/** Throws the error that keeps `kind` from taking this game: queue = owned only, wishlist = unowned only. */
function assertAccepts(db: Db, userId: number, kind: string, igdbId: number) {
    if (kind === 'queue' && !owns(db, userId, igdbId))
        throw new HttpError(400, 'Only games in your collection can go on the queue');
    if (kind === 'wishlist') {
        const owned = db
            .select({ id: entries.id })
            .from(entries)
            .where(and(eq(entries.userId, userId), eq(entries.gameId, igdbId)))
            .get();
        if (owned)
            throw new HttpError(409, 'That game is already in your collection', {
                entryId: owned.id
            });
    }
}

/**
 * Adds a game to the end, owned or not (the game must already be in the shared cache). Adding
 * something already in the list is a no-op. The queue takes collection games only and the
 * wishlist takes games you don't own.
 */
export function addToList(
    db: Db,
    userId: number,
    listId: number,
    igdbId: number,
    extras: ListItemExtras = {}
): ListDetailDto {
    const list = requireList(db, userId, listId);
    assertAccepts(db, userId, list.kind, igdbId);
    if (!db.select({ id: games.id }).from(games).where(eq(games.id, igdbId)).get())
        throw new HttpError(404, 'Game not found');
    if (extras.platformId && !existingPlatformIds(db, [extras.platformId]).has(extras.platformId))
        throw new HttpError(400, `Unknown platform id: ${extras.platformId}`);
    const top = db
        .select({ n: max(listItems.position) })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .get()!.n;
    db.transaction((tx) => {
        const added = tx
            .insert(listItems)
            .values({
                listId,
                gameId: igdbId,
                position: (top ?? -1) + 1,
                platformId: extras.platformId ?? null,
                note: extras.note ?? ''
            })
            .onConflictDoNothing()
            .run();
        if (added.changes > 0 && list.kind !== 'list')
            recordActivity(tx as unknown as Db, userId, {
                type: list.kind === 'queue' ? 'queued' : 'wishlisted',
                gameId: igdbId
            });
    });
    return getList(db, userId, listId, FIRST_PAGE);
}

/** `addToList` for a game that may not be cached yet: fetches it from IGDB first (never for a refused add). */
export async function addGameToList(
    db: Db,
    igdb: IgdbClient | undefined,
    userId: number,
    listId: number,
    igdbId: number,
    extras: ListItemExtras = {}
): Promise<ListDetailDto> {
    assertAccepts(db, userId, requireList(db, userId, listId).kind, igdbId);
    await ensureGame(db, igdb, igdbId);
    return addToList(db, userId, listId, igdbId, extras);
}

/** Deletes one item and closes the gap so positions stay 0..n-1. */
export function removeItem(db: Db, listId: number, gameId: number) {
    const removed = db
        .delete(listItems)
        .where(and(eq(listItems.listId, listId), eq(listItems.gameId, gameId)))
        .run();
    if (removed.changes === 0) return;
    const rest = db
        .select({ gameId: listItems.gameId })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.position))
        .all();
    rest.forEach((r, i) =>
        db
            .update(listItems)
            .set({ position: i })
            .where(and(eq(listItems.listId, listId), eq(listItems.gameId, r.gameId)))
            .run()
    );
}

/** Starting a game, or removing it from the collection, takes it off the queue. A no-op if it wasn't queued. */
export function dequeue(db: Db, userId: number, gameId: number) {
    const queue = db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'queue')))
        .get();
    if (queue) removeItem(db, queue.id, gameId);
}

/** Owning a game ends the wish: called when a game joins the collection. */
export function dropFromWishlist(db: Db, userId: number, gameId: number) {
    const wishlist = findWishlist(db, userId);
    if (wishlist) removeItem(db, wishlist.id, gameId);
}

export function removeFromList(
    db: Db,
    userId: number,
    listId: number,
    igdbId: number
): ListDetailDto {
    requireList(db, userId, listId);
    db.transaction((tx) => removeItem(tx as unknown as Db, listId, igdbId));
    return getList(db, userId, listId, FIRST_PAGE);
}

/** Moves one game to an absolute position; only the rows between its old and new place change. */
export function moveInList(
    db: Db,
    userId: number,
    listId: number,
    igdbId: number,
    toIndex: number
): ListDetailDto {
    requireList(db, userId, listId);
    const ids = db
        .select({ gameId: listItems.gameId })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.position))
        .all()
        .map((r) => r.gameId);
    const moved = moveInOrder(ids, igdbId, toIndex);
    if (!moved) throw new HttpError(404, 'That game is not in the list');
    db.transaction((tx) => {
        for (let i = moved.first; i <= moved.last; i++)
            tx.update(listItems)
                .set({ position: i })
                .where(and(eq(listItems.listId, listId), eq(listItems.gameId, moved.next[i]!)))
                .run();
    });
    return getList(db, userId, listId, FIRST_PAGE);
}

export function reorderList(
    db: Db,
    userId: number,
    listId: number,
    igdbIds: number[]
): ListDetailDto {
    requireList(db, userId, listId);
    const current = db
        .select({ gameId: listItems.gameId })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .all();
    const same =
        igdbIds.length === current.length &&
        new Set(igdbIds).size === igdbIds.length &&
        current.every((r) => igdbIds.includes(r.gameId));
    if (!same) throw new HttpError(400, "The new order must contain exactly the list's games");
    db.transaction((tx) =>
        igdbIds.forEach((gameId, i) =>
            tx
                .update(listItems)
                .set({ position: i })
                .where(and(eq(listItems.listId, listId), eq(listItems.gameId, gameId)))
                .run()
        )
    );
    return getList(db, userId, listId, FIRST_PAGE);
}
