import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { ActivityEventDto, ActivityType, PageQuery } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { activityEvents, games } from '../db/schema.js';

/** Doing the same thing to the same subject again this soon updates the last event instead. */
const REPEAT_WINDOW_MS = 60 * 60 * 1000;

export interface ActivityInput {
    type: ActivityType;
    gameId?: number;
    subjectId?: number;
    subjectName?: string;
    detail?: number | null;
}

/**
 * Appends to the user's activity feed. Call it inside the transaction of the action it describes,
 * so an action that rolls back leaves no event. A repeat of the user's latest event (re-rating a
 * game, toggling a favorite) within an hour replaces it, so fiddling doesn't flood the feed.
 */
export function recordActivity(db: Db, userId: number, ev: ActivityInput) {
    const now = Date.now();
    const last = db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.userId, userId))
        .orderBy(desc(activityEvents.at), desc(activityEvents.id))
        .limit(1)
        .get();
    if (
        last &&
        last.type === ev.type &&
        last.gameId === (ev.gameId ?? null) &&
        last.subjectId === (ev.subjectId ?? null) &&
        now - last.at < REPEAT_WINDOW_MS
    ) {
        db.update(activityEvents)
            .set({ at: now, subjectName: ev.subjectName ?? null, detail: ev.detail ?? null })
            .where(eq(activityEvents.id, last.id))
            .run();
        return;
    }
    db.insert(activityEvents)
        .values({
            userId,
            type: ev.type,
            at: now,
            gameId: ev.gameId ?? null,
            subjectId: ev.subjectId ?? null,
            subjectName: ev.subjectName ?? null,
            detail: ev.detail ?? null
        })
        .run();
}

/** Drops the events about something that no longer exists (a deleted grid, list, game…). */
export function forgetSubject(db: Db, userId: number, types: ActivityType[], subjectId: number) {
    db.delete(activityEvents)
        .where(
            and(
                eq(activityEvents.userId, userId),
                inArray(activityEvents.type, types),
                eq(activityEvents.subjectId, subjectId)
            )
        )
        .run();
}

/** Removes a deleted collection game from the feed; its wishlist history stays. */
export function forgetGame(db: Db, userId: number, gameId: number) {
    db.delete(activityEvents)
        .where(
            and(
                eq(activityEvents.userId, userId),
                eq(activityEvents.gameId, gameId),
                inArray(activityEvents.type, [
                    'added',
                    'started',
                    'paused',
                    'resumed',
                    'finished',
                    'abandoned',
                    'rated',
                    'favorited',
                    'queued',
                    'slotted'
                ])
            )
        )
        .run();
}

/** Newest first. */
export function pageActivity(
    db: Db,
    userId: number,
    page: PageQuery
): { events: ActivityEventDto[]; total: number } {
    const total =
        db
            .select({ n: count() })
            .from(activityEvents)
            .where(eq(activityEvents.userId, userId))
            .get()?.n ?? 0;
    const rows = db
        .select({ e: activityEvents, game: games })
        .from(activityEvents)
        .leftJoin(games, eq(games.id, activityEvents.gameId))
        .where(eq(activityEvents.userId, userId))
        .orderBy(desc(activityEvents.at), desc(activityEvents.id))
        .limit(page.limit)
        .offset(page.offset)
        .all();
    return {
        total,
        events: rows.map(({ e, game }) => ({
            id: e.id,
            type: e.type,
            at: e.at,
            game: game ? { id: game.id, name: game.name, coverImageId: game.coverImageId } : null,
            subject: e.subjectName === null ? null : { id: e.subjectId, name: e.subjectName },
            detail: e.detail
        }))
    };
}
