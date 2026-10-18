import { and, asc, eq, isNotNull, max, sql } from 'drizzle-orm';
import type { EntryDto, ListDetailDto, ListSummaryDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, games, listItems, lists } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { hydrate } from './entries.js';

function requireList(db: Db, userId: number, id: number) {
    const list = db
        .select()
        .from(lists)
        .where(and(eq(lists.id, id), eq(lists.userId, userId)))
        .get();
    if (!list) throw new HttpError(404, 'List not found');
    return list;
}

/** The user's queue, created the first time it's needed. */
export function ensureQueue(db: Db, userId: number) {
    const find = () =>
        db
            .select()
            .from(lists)
            .where(and(eq(lists.userId, userId), eq(lists.kind, 'queue')))
            .get();
    return (
        find() ??
        db
            .insert(lists)
            .values({ userId, name: 'Queue', kind: 'queue' })
            .onConflictDoNothing()
            .returning()
            .get() ??
        find()!
    );
}

export function getQueue(db: Db, userId: number): ListDetailDto {
    return getList(db, userId, ensureQueue(db, userId).id);
}

function assertPlainList(list: { kind: string }, action: string) {
    if (list.kind === 'queue') throw new HttpError(400, `The queue can't be ${action}`);
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
        .innerJoin(entries, eq(entries.id, listItems.entryId))
        .innerJoin(games, eq(games.id, entries.gameId))
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

export function getList(db: Db, userId: number, id: number): ListDetailDto {
    const list = requireList(db, userId, id);
    const ids = db
        .select({ entryId: listItems.entryId })
        .from(listItems)
        .where(eq(listItems.listId, id))
        .orderBy(asc(listItems.position))
        .all()
        .map((r) => r.entryId);
    // hydrate() keeps the order it's given
    const dtos: EntryDto[] = hydrate(db, userId, ids);
    return { id: list.id, name: list.name, kind: list.kind, entries: dtos };
}

export function createList(db: Db, userId: number, name: string): ListSummaryDto {
    const row = db.insert(lists).values({ userId, name }).returning().get();
    return { id: row.id, name: row.name, count: 0, covers: [] };
}

export function renameList(db: Db, userId: number, id: number, name: string) {
    assertPlainList(requireList(db, userId, id), 'renamed');
    db.update(lists).set({ name }).where(eq(lists.id, id)).run();
}

export function deleteList(db: Db, userId: number, id: number) {
    assertPlainList(requireList(db, userId, id), 'deleted');
    db.delete(lists).where(eq(lists.id, id)).run();
}

/** Adds to the end. Adding something already in the list is a no-op. */
export function addToList(db: Db, userId: number, listId: number, entryId: number): ListDetailDto {
    requireList(db, userId, listId);
    const entry = db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        .get();
    if (!entry) throw new HttpError(404, 'Entry not found');
    const top = db
        .select({ n: max(listItems.position) })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .get()!.n;
    db.insert(listItems)
        .values({ listId, entryId, position: (top ?? -1) + 1 })
        .onConflictDoNothing()
        .run();
    return getList(db, userId, listId);
}

/** Deletes one item and closes the gap so positions stay 0..n-1. */
function removeItem(db: Db, listId: number, entryId: number) {
    db.delete(listItems)
        .where(and(eq(listItems.listId, listId), eq(listItems.entryId, entryId)))
        .run();
    const rest = db
        .select({ entryId: listItems.entryId })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.position))
        .all();
    rest.forEach((r, i) =>
        db
            .update(listItems)
            .set({ position: i })
            .where(and(eq(listItems.listId, listId), eq(listItems.entryId, r.entryId)))
            .run()
    );
}

/** Starting a game takes it off the queue. Does nothing if it wasn't queued. */
export function dequeue(db: Db, userId: number, entryId: number) {
    const queue = db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.userId, userId), eq(lists.kind, 'queue')))
        .get();
    if (queue) removeItem(db, queue.id, entryId);
}

export function removeFromList(
    db: Db,
    userId: number,
    listId: number,
    entryId: number
): ListDetailDto {
    requireList(db, userId, listId);
    db.transaction((tx) => removeItem(tx as unknown as Db, listId, entryId));
    return getList(db, userId, listId);
}

export function reorderList(
    db: Db,
    userId: number,
    listId: number,
    entryIds: number[]
): ListDetailDto {
    requireList(db, userId, listId);
    const current = db
        .select({ entryId: listItems.entryId })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .all();
    const same =
        entryIds.length === current.length &&
        new Set(entryIds).size === entryIds.length &&
        current.every((r) => entryIds.includes(r.entryId));
    if (!same) throw new HttpError(400, "The new order must contain exactly the list's games");
    db.transaction((tx) =>
        entryIds.forEach((entryId, i) =>
            tx
                .update(listItems)
                .set({ position: i })
                .where(and(eq(listItems.listId, listId), eq(listItems.entryId, entryId)))
                .run()
        )
    );
    return getList(db, userId, listId);
}
