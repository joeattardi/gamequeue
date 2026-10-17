import { and, count, eq } from 'drizzle-orm';
import {
    ENTRY_STATUSES,
    type EntryDto,
    type EntryStatus,
    type ProfileDto,
    type ProfileQueueDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, listItems, lists, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { getList, listLists } from './lists.js';
import { listSlots } from './slots.js';

const toPublic = (e: EntryDto): PublicEntryDto => ({
    id: e.id,
    status: e.status,
    rating: e.rating,
    ttbMinutes: e.ttbMinutes,
    lastFinishedOn: e.lastFinishedOn,
    game: e.game,
    platforms: e.platforms,
    tags: e.tags
});

function requireUser(db: Db, username: string) {
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new HttpError(404, 'Not found');
    return user;
}

/** Read-only: must not create anything (so no `getQueue`/`ensureQueue`). The queue has its own page. */
export function getProfile(db: Db, username: string): ProfileDto {
    const user = requireUser(db, username);

    const byStatus = Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0])) as Record<
        EntryStatus,
        number
    >;
    const statuses = db
        .select({ status: entries.status })
        .from(entries)
        .where(eq(entries.userId, user.id))
        .all();
    for (const { status } of statuses) byStatus[status]++;

    const queued =
        db
            .select({ n: count() })
            .from(listItems)
            .innerJoin(lists, eq(lists.id, listItems.listId))
            .where(and(eq(lists.userId, user.id), eq(lists.kind, 'queue')))
            .get()?.n ?? 0;

    return {
        username: user.username,
        joinedAt: user.createdAt,
        slots: listSlots(db, user.id).map((s) => ({
            name: s.name,
            entry: s.entry ? toPublic(s.entry) : null
        })),
        summary: { total: statuses.length, queued, byStatus },
        lists: listLists(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            entries: getList(db, user.id, l.id).entries.map(toPublic)
        }))
    };
}

/** Read-only: a user who never queued anything has no queue row yet, which reads as empty. */
export function getProfileQueue(db: Db, username: string): ProfileQueueDto {
    const user = requireUser(db, username);
    const queue = db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.userId, user.id), eq(lists.kind, 'queue')))
        .get();
    return {
        username: user.username,
        entries: queue ? getList(db, user.id, queue.id).entries.map(toPublic) : []
    };
}
