import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { emailVerifications, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { reportError } from './error-log.js';
import { MailQuotaError } from './mail-budget.js';
import type { Mailer } from './mailer.js';

export const VERIFICATION_TTL_MS = 24 * 3600_000;
/** Minimum wait between two emails to the same account */
export const RESEND_COOLDOWN_MS = 60_000;
export const RESENDS_PER_HOUR = 5;
/** Accounts that never confirm their email are deleted after this long */
export const UNVERIFIED_TTL_MS = 7 * 24 * 3600_000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

const escapeHtml = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function verificationMail(username: string, link: string) {
    const text = `Hi ${username},

Confirm your email address to start using GameQueue:

${link}

The link works for 24 hours. If you didn't create a GameQueue account, you can ignore this email.`;
    const html = `<p>Hi ${escapeHtml(username)},</p>
<p>Confirm your email address to start using GameQueue:</p>
<p><a href="${escapeHtml(link)}">Confirm my email</a></p>
<p>Or paste this link into your browser:<br>${escapeHtml(link)}</p>
<p>The link works for 24 hours. If you didn't create a GameQueue account, you can ignore this email.</p>`;
    return { subject: 'Confirm your GameQueue email address', text, html };
}

/**
 * Sends the user a fresh confirmation link. Never throws: a failed send is recorded for the admin
 * error log and the user can ask again. Earlier links stay valid until they expire.
 */
export async function sendVerification(
    db: Db,
    config: Pick<Config, 'publicUrl'>,
    mailer: Mailer | undefined,
    user: { id: number; username: string; email: string },
    now = Date.now()
): Promise<boolean> {
    const token = randomBytes(32).toString('base64url');
    db.insert(emailVerifications)
        .values({
            userId: user.id,
            tokenHash: hash(token),
            email: user.email,
            expiresAt: now + VERIFICATION_TTL_MS,
            createdAt: now
        })
        .run();
    if (!mailer) {
        // Local development: no email provider, so the link goes to the console
        console.log(
            `Email verification link for ${user.username}: ${config.publicUrl}/verify-email?token=${token}`
        );
        return true;
    }
    try {
        await mailer({
            to: user.email,
            ...verificationMail(user.username, `${config.publicUrl}/verify-email?token=${token}`)
        });
        return true;
    } catch (e) {
        // Already recorded as `email_quota`
        if (!(e instanceof MailQuotaError))
            reportError(db, 'email_failed', e, {
                context: { what: 'verification', userId: user.id }
            });
        return false;
    }
}

/** Throws 429 when the account asked for a link too recently or too often. */
export function assertCanResend(db: Db, userId: number, now = Date.now()) {
    const recent = db
        .select({ createdAt: emailVerifications.createdAt })
        .from(emailVerifications)
        .where(
            and(
                eq(emailVerifications.userId, userId),
                gt(emailVerifications.createdAt, now - 3600_000)
            )
        )
        .all();
    const latest = Math.max(0, ...recent.map((r) => r.createdAt));
    const cooldown = latest + RESEND_COOLDOWN_MS - now;
    if (cooldown > 0)
        throw new HttpError(429, 'Please wait a minute before asking for another email', {
            retryAfter: Math.ceil(cooldown / 1000)
        });
    if (recent.length >= RESENDS_PER_HOUR) {
        const oldest = Math.min(...recent.map((r) => r.createdAt));
        throw new HttpError(429, 'Too many emails requested. Try again later', {
            retryAfter: Math.ceil((oldest + 3600_000 - now) / 1000)
        });
    }
}

/**
 * Confirms the address behind a token. Returns the user id, or undefined when the token is unknown,
 * expired, or was issued for an address the account no longer has. Confirming twice is harmless:
 * the first use deletes every pending token of the account.
 */
export function verifyEmail(db: Db, token: string, now = Date.now()): number | undefined {
    return db.transaction((tx) => {
        const row = tx
            .select({
                userId: emailVerifications.userId,
                email: emailVerifications.email,
                expiresAt: emailVerifications.expiresAt,
                currentEmail: users.email
            })
            .from(emailVerifications)
            .innerJoin(users, eq(users.id, emailVerifications.userId))
            .where(eq(emailVerifications.tokenHash, hash(token)))
            .get();
        if (!row || row.expiresAt <= now || row.email !== row.currentEmail) return undefined;
        tx.update(users)
            .set({ emailVerifiedAt: now })
            .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)))
            .run();
        tx.delete(emailVerifications).where(eq(emailVerifications.userId, row.userId)).run();
        return row.userId;
    });
}

/** Lets an unverified user fix a mistyped address; old links die with it (their email no longer matches). */
export function changeUnverifiedEmail(db: Db, userId: number, email: string) {
    try {
        db.update(users)
            .set({ email })
            .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
            .run();
    } catch (e) {
        if (e instanceof Error && /UNIQUE/.test(e.message))
            throw new HttpError(409, 'Invalid input', {
                details: [{ path: 'email', message: 'That email is already in use' }]
            });
        throw e;
    }
}

export const markVerified = (db: Db, userId: number, now = Date.now()) => {
    db.update(users)
        .set({ emailVerifiedAt: now })
        .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
        .run();
    db.delete(emailVerifications).where(eq(emailVerifications.userId, userId)).run();
};

/** Deletes expired links and the accounts that stayed unverified for a week (everything they own cascades). */
export function purgeUnverified(db: Db, now = Date.now()) {
    db.delete(emailVerifications).where(lt(emailVerifications.expiresAt, now)).run();
    return db
        .delete(users)
        .where(and(isNull(users.emailVerifiedAt), lt(users.createdAt, now - UNVERIFIED_TTL_MS)))
        .run().changes;
}
