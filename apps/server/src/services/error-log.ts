import { count, desc, eq, lt, notInArray, sql } from 'drizzle-orm';
import { ERROR_KINDS, type ErrorEventDto, type ErrorKind, type ErrorsDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { errorEvents } from '../db/schema.js';

export const ERROR_RETENTION_DAYS = 30;
/** A crash loop or a down IGDB must not grow the table without bound */
export const ERROR_MAX_ROWS = 5000;
const MAX_TEXT = 4000;

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

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
    } catch (dbErr) {
        console.error('Could not record the error:', dbErr);
    }
}

/** Newest first. `kind` narrows the list; the per-kind counts always cover everything stored. */
export function listErrors(
    db: Db,
    opts: { kind?: ErrorKind; limit: number; offset: number },
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
