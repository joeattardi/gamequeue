import { and, asc, eq, max, sql } from 'drizzle-orm';
import type { EntryDto, ListDetailDto, ListSummaryDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, listItems, lists } from '../db/schema.js';
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

export function listLists(db: Db, userId: number): ListSummaryDto[] {
    return db
        .select({
            id: lists.id,
            name: lists.name,
            count: sql<number>`(select count(*) from ${listItems} where ${listItems.listId} = ${lists.id})`
        })
        .from(lists)
        .where(eq(lists.userId, userId))
        .orderBy(asc(sql`lower(${lists.name})`), asc(lists.id))
        .all();
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
    return { id: list.id, name: list.name, entries: dtos };
}

export function createList(db: Db, userId: number, name: string): ListSummaryDto {
    const row = db.insert(lists).values({ userId, name }).returning().get();
    return { id: row.id, name: row.name, count: 0 };
}

export function renameList(db: Db, userId: number, id: number, name: string) {
    requireList(db, userId, id);
    db.update(lists).set({ name }).where(eq(lists.id, id)).run();
}

export function deleteList(db: Db, userId: number, id: number) {
    requireList(db, userId, id);
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

export function removeFromList(
    db: Db,
    userId: number,
    listId: number,
    entryId: number
): ListDetailDto {
    requireList(db, userId, listId);
    db.transaction((tx) => {
        tx.delete(listItems)
            .where(and(eq(listItems.listId, listId), eq(listItems.entryId, entryId)))
            .run();
        // Close the gap so positions stay 0..n-1
        const rest = tx
            .select({ entryId: listItems.entryId })
            .from(listItems)
            .where(eq(listItems.listId, listId))
            .orderBy(asc(listItems.position))
            .all();
        rest.forEach((r, i) =>
            tx
                .update(listItems)
                .set({ position: i })
                .where(and(eq(listItems.listId, listId), eq(listItems.entryId, r.entryId)))
                .run()
        );
    });
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
