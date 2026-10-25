import { and, count, desc, eq, gte } from 'drizzle-orm';
import { ERROR_KINDS, type ErrorKind } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { errorEvents } from '../db/schema.js';
import type { Notify } from './notify.js';

export const ALERT_THRESHOLD = 5;
export const ALERT_WINDOW_MS = 10 * 60_000;
export const ALERT_COOLDOWN_MS = 60 * 60_000;

/**
 * A crash exits before an email could go out, and a failing email must not trigger another. The
 * email limit sends its own alert, once a day (services/mail-budget.ts).
 */
const SILENT: ErrorKind[] = ['process_crash', 'email_failed', 'email_quota'];

/**
 * Emails the owner when one kind of error piles up: `ALERT_THRESHOLD` events inside
 * `ALERT_WINDOW_MS`, then at most one email per kind per `ALERT_COOLDOWN_MS`. The cooldown is
 * in memory, so a restart may alert again, which is acceptable. Call it after each recorded error.
 */
export function createErrorAlerter(db: Db, notify: Notify, now: () => number = Date.now) {
    const lastAlert = new Map<ErrorKind, number>();
    return (kind: ErrorKind) => {
        if (SILENT.includes(kind)) return;
        const at = now();
        const last = lastAlert.get(kind);
        if (last !== undefined && at - last < ALERT_COOLDOWN_MS) return;
        const recent = and(eq(errorEvents.kind, kind), gte(errorEvents.at, at - ALERT_WINDOW_MS));
        const n = db.select({ n: count() }).from(errorEvents).where(recent).get()?.n ?? 0;
        if (n < ALERT_THRESHOLD) return;
        lastAlert.set(kind, at);
        const latest = db
            .select({ message: errorEvents.message })
            .from(errorEvents)
            .where(eq(errorEvents.kind, kind))
            .orderBy(desc(errorEvents.id))
            .limit(1)
            .get()?.message;
        notify(
            `GameQueue: ${ERROR_KINDS[kind]}`,
            `${n} "${ERROR_KINDS[kind]}" errors in the last ${ALERT_WINDOW_MS / 60_000} minutes.\n\n` +
                `Latest: ${latest ?? 'unknown'}\n\n` +
                `See Admin > Errors for details. No further email about this kind for ${ALERT_COOLDOWN_MS / 60_000} minutes.`
        );
    };
}
