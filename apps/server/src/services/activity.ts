import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import type {
    ActivityEventDto,
    ActivityType,
    PageQuery,
    TimelineDto,
    TimelinePlayingDto,
    TimelineQuery
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { activityEvents, entries, games, playthroughs } from '../db/schema.js';

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

const DAY_MS = 86_400_000;
/** More than a person does in a year; a cap so one runaway account can't make a huge response. */
const TIMELINE_MAX_EVENTS = 10_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Events and played days for the calendar. Days are the viewer's local ones, which the server
 * can't know, so the events come back a day wider on each side and the client cuts them.
 * A playthrough counts as played from its start to its end; an open one runs to today, and one
 * with an unknown start is skipped (one with a known start but unknown end is that one day).
 */
export function getTimeline(db: Db, userId: number, q: TimelineQuery): TimelineDto {
    const fromMs = Date.parse(`${q.from}T00:00:00Z`) - DAY_MS;
    const toMs = Date.parse(`${q.to}T00:00:00Z`) + 2 * DAY_MS;
    const rows = db
        .select({ e: activityEvents, game: games })
        .from(activityEvents)
        .leftJoin(games, eq(games.id, activityEvents.gameId))
        .where(
            and(
                eq(activityEvents.userId, userId),
                gte(activityEvents.at, fromMs),
                lt(activityEvents.at, toMs)
            )
        )
        .orderBy(asc(activityEvents.at), asc(activityEvents.id))
        .limit(TIMELINE_MAX_EVENTS)
        .all();
    const today = isoDay(Date.now());
    const played = db
        .select({ p: playthroughs, game: games })
        .from(playthroughs)
        .innerJoin(entries, eq(entries.id, playthroughs.entryId))
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(and(eq(playthroughs.userId, userId), isNotNull(playthroughs.startedOn)))
        .all();
    const playing: TimelinePlayingDto[] = [];
    for (const { p, game } of played) {
        const start = p.startedOn!;
        const end = p.endedOn ?? (p.outcome === null ? today : start);
        // Dates edited into the wrong order still cover their start day
        const last = end < start ? start : end;
        if (start > q.to || last < q.from) continue;
        playing.push({ game: { id: game.id, name: game.name }, start, end: last });
    }
    return {
        events: rows.map(({ e, game }) => ({
            id: e.id,
            type: e.type,
            at: e.at,
            game: game ? { id: game.id, name: game.name, coverImageId: game.coverImageId } : null,
            subject: e.subjectName === null ? null : { id: e.subjectId, name: e.subjectName },
            detail: e.detail
        })),
        playing
    };
}
