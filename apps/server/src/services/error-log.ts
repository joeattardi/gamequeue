import { count, desc, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import {
    ERROR_GROUPS,
    ERROR_HISTORY_DAYS,
    ERROR_KINDS,
    type ErrorEventDto,
    type ErrorGroup,
    type ErrorHistoryDay,
    type ErrorKind,
    type ErrorsDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { errorEvents } from '../db/schema.js';

export const ERROR_RETENTION_DAYS = 30;
/** A crash loop or a down IGDB must not grow the table without bound */
export const ERROR_MAX_ROWS = 5000;
const MAX_TEXT = 4000;

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

let alerter: ((kind: ErrorKind) => void) | undefined;
/** Registers what runs after each recorded error (the email alert); set once at startup. */
export const setErrorAlerter = (fn: ((kind: ErrorKind) => void) | undefined) => {
    alerter = fn;
};

export interface ErrorInfo {
    status?: number | null;
    route?: string | null;
    context?: Record<string, unknown>;
}

/**
 * Records an error for the admin page and logs it to the console as before. Never throws, so it is
 * safe in error handlers and background jobs; if the database itself is the problem only the console
 * line survives.
 */
export function reportError(
    db: Db,
    kind: ErrorKind,
    err: unknown,
    info: ErrorInfo = {},
    now = Date.now()
) {
    console.error(`[${kind}]`, err);
    try {
        const e = err instanceof Error ? err : undefined;
        db.insert(errorEvents)
            .values({
                at: now,
                kind,
                message: clip(e ? e.message : String(err)),
                status: info.status ?? null,
                route: info.route ?? null,
                stack: e?.stack ? clip(e.stack) : null,
                context: info.context ? clip(JSON.stringify(info.context)) : null
            })
            .run();
        alerter?.(kind);
    } catch (dbErr) {
        console.error('Could not record the error:', dbErr);
    }
}

const DAY_MS = 24 * 3600_000;
const GROUP_OF = new Map<string, ErrorGroup>(
    (Object.keys(ERROR_GROUPS) as ErrorGroup[]).flatMap((g) =>
        ERROR_GROUPS[g].kinds.map((k) => [k, g] as const)
    )
);

/**
 * Errors per day for the last `ERROR_HISTORY_DAYS`, in the viewer's time zone (`tzOffsetMin` is
 * `Date.getTimezoneOffset()`: minutes UTC is ahead of local time). Today's offset is applied to
 * the whole window, which can put an event near midnight on the wrong side of a DST change.
 */
function errorHistory(db: Db, tzOffsetMin: number, now: number): ErrorHistoryDay[] {
    const shift = tzOffsetMin * 60_000;
    const today = Math.floor((now - shift) / DAY_MS);
    const first = today - (ERROR_HISTORY_DAYS - 1);
    const days: ErrorHistoryDay[] = Array.from({ length: ERROR_HISTORY_DAYS }, (_, i) => ({
        day: new Date((first + i) * DAY_MS).toISOString().slice(0, 10),
        rateLimit: 0,
        igdb: 0,
        server: 0
    }));
    // Bound numbers reach SQLite as floats, so truncate explicitly instead of relying on integer division
    const dayOf = sql<number>`cast((${errorEvents.at} - ${shift}) / ${DAY_MS} as integer)`;
    const rows = db
        .select({
            d: dayOf,
            kind: errorEvents.kind,
            n: count()
        })
        .from(errorEvents)
        .where(gte(errorEvents.at, first * DAY_MS + shift))
        .groupBy(dayOf, errorEvents.kind)
        .all();
    for (const r of rows) {
        const group = GROUP_OF.get(r.kind);
        const day = days[r.d - first];
        if (group && day) day[group] += r.n;
    }
    return days;
}

/** Newest first. `kind` narrows the list; the per-kind counts always cover everything stored. */
export function listErrors(
    db: Db,
    opts: { kind?: ErrorKind; limit: number; offset: number; tzOffsetMin?: number },
    now = Date.now()
): ErrorsDto {
    const where = opts.kind ? eq(errorEvents.kind, opts.kind) : undefined;
    const events = db
        .select()
        .from(errorEvents)
        .where(where)
        .orderBy(desc(errorEvents.at), desc(errorEvents.id))
        .limit(opts.limit)
        .offset(opts.offset)
        .all() as ErrorEventDto[];
    const total = db.select({ n: count() }).from(errorEvents).where(where).get()?.n ?? 0;

    const dayAgo = now - 24 * 3600_000;
    const rows = db
        .select({
            kind: errorEvents.kind,
            total: count(),
            last24h: sql<number>`coalesce(sum(${errorEvents.at} >= ${dayAgo}), 0)`
        })
        .from(errorEvents)
        .groupBy(errorEvents.kind)
        .all();
    const known = new Set(Object.keys(ERROR_KINDS));
    const kinds = rows
        .filter((r) => known.has(r.kind))
        .map((r) => ({ kind: r.kind as ErrorKind, total: r.total, last24h: r.last24h }))
        .sort((a, b) => b.last24h - a.last24h || b.total - a.total);
    return {
        events,
        total,
        kinds,
        last24h: kinds.reduce((n, k) => n + k.last24h, 0),
        history: errorHistory(db, opts.tzOffsetMin ?? 0, now),
        retentionDays: ERROR_RETENTION_DAYS
    };
}

/** Deletes events past the retention period, then the oldest beyond the row cap. */
export function pruneErrors(db: Db, now = Date.now()) {
    const cutoff = now - ERROR_RETENTION_DAYS * 24 * 3600_000;
    const old = db.delete(errorEvents).where(lt(errorEvents.at, cutoff)).run().changes;
    const keep = db
        .select({ id: errorEvents.id })
        .from(errorEvents)
        .orderBy(desc(errorEvents.id))
        .limit(ERROR_MAX_ROWS);
    const extra = db.delete(errorEvents).where(notInArray(errorEvents.id, keep)).run().changes;
    return old + extra;
}

export function clearErrors(db: Db, kind?: ErrorKind) {
    return {
        deleted: db
            .delete(errorEvents)
            .where(kind ? eq(errorEvents.kind, kind) : undefined)
            .run().changes
    };
}
