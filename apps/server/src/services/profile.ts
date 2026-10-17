import { eq } from 'drizzle-orm';
import {
    ENTRY_STATUSES,
    type EntryDto,
    type EntryStatus,
    type ProfileDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { entries, users } from '../db/schema.js';
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

/** Read-only: must not create anything (so no `getQueue`/`ensureQueue`); the queue stays private. */
export function getProfile(db: Db, username: string): ProfileDto {
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new HttpError(404, 'Not found');

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

    return {
        username: user.username,
        joinedAt: user.createdAt,
        slots: listSlots(db, user.id).map((s) => ({
            name: s.name,
            entry: s.entry ? toPublic(s.entry) : null
        })),
        summary: { total: statuses.length, byStatus },
        lists: listLists(db, user.id).map((l) => ({
            id: l.id,
            name: l.name,
            entries: getList(db, user.id, l.id).entries.map(toPublic)
        }))
    };
}
