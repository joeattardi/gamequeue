import { gte, lt, sql } from 'drizzle-orm';
import type { IgdbHistoryDay } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { igdbDaily } from '../db/schema.js';

const DAY_MS = 24 * 3600_000;
export const IGDB_HISTORY_DAYS = 30;
const KEEP_DAYS = 90;

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Counts one IGDB HTTP attempt on today's (UTC) row. A write per request is fine at IGDB's
 * 4 requests a second ceiling, and a failure here must never break the request itself.
 */
export function recordIgdbAttempt(db: Db, ok: boolean, status: number | null, now = Date.now()) {
    const column = ok ? 'ok' : status === 429 ? 'rateLimited' : 'failed';
    try {
        db.insert(igdbDaily)
            .values({ day: dayOf(now), [column]: 1 })
            .onConflictDoUpdate({
                target: igdbDaily.day,
                set: { [column]: sql`${igdbDaily[column]} + 1` }
            })
            .run();
    } catch (e) {
        console.error('Could not record the IGDB request:', e);
    }
}

/** The last 30 UTC days, oldest first, zero-filled. */
export function igdbHistory(db: Db, now = Date.now()): IgdbHistoryDay[] {
    const first = Math.floor(now / DAY_MS) - (IGDB_HISTORY_DAYS - 1);
    const rows = new Map(
        db
            .select()
            .from(igdbDaily)
            .where(gte(igdbDaily.day, dayOf(first * DAY_MS)))
            .all()
            .map((r) => [r.day, r])
    );
    return Array.from({ length: IGDB_HISTORY_DAYS }, (_, i) => {
        const day = dayOf((first + i) * DAY_MS);
        const r = rows.get(day);
        return { day, ok: r?.ok ?? 0, rateLimited: r?.rateLimited ?? 0, failed: r?.failed ?? 0 };
    });
}

export function pruneIgdbHistory(db: Db, now = Date.now()) {
    return db
        .delete(igdbDaily)
        .where(lt(igdbDaily.day, dayOf(now - KEEP_DAYS * DAY_MS)))
        .run().changes;
}
