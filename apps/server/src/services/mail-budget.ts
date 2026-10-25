import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { mailDaily } from '../db/schema.js';
import { reportError } from './error-log.js';
import type { Mailer } from './mailer.js';
import type { Notify } from './notify.js';

/** Thrown instead of sending once today's emails are used up; callers treat it as a failed send. */
export class MailQuotaError extends Error {
    constructor(limit: number) {
        super(`Daily email limit of ${limit} reached; not sent`);
    }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Counts one email on today's (UTC) row unless the day is already at `limit`. One statement, so
 * two sends at once can't both take the last slot. Returns whether the email may go out.
 */
export function takeMailSlot(db: Db, limit: number, now = Date.now()): boolean {
    return (
        db
            .insert(mailDaily)
            .values({ day: dayOf(now), sent: 1 })
            .onConflictDoUpdate({
                target: mailDaily.day,
                set: { sent: sql`${mailDaily.sent} + 1` },
                setWhere: sql`${mailDaily.sent} < ${limit}`
            })
            .run().changes > 0
    );
}

/**
 * Wraps the user mailer with the daily cap. Every refused email is recorded as `email_quota`, and
 * the owner hears about it once per day (in memory, so a restart may alert again).
 */
export function limitMailer(
    db: Db,
    limit: number,
    mailer: Mailer,
    notify: Notify,
    now: () => number = Date.now
): Mailer {
    let alertedDay: string | undefined;
    return async (mail) => {
        const at = now();
        if (!takeMailSlot(db, limit, at)) {
            const err = new MailQuotaError(limit);
            reportError(db, 'email_quota', err, {}, at);
            if (alertedDay !== dayOf(at)) {
                alertedDay = dayOf(at);
                notify(
                    'GameQueue: daily email limit reached',
                    `GameQueue has sent ${limit} emails today (UTC), the MAIL_DAILY_LIMIT. ` +
                        'Confirmation and password reset emails are refused until midnight UTC.\n\n' +
                        'If this is not real traffic, someone may be signing up with addresses ' +
                        'they do not own. Details: Admin > Errors.'
                );
            }
            throw err;
        }
        await mailer(mail);
    };
}
