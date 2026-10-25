import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { passwordResets, sessions, users } from '../db/schema.js';
import { hashPassword } from '../auth/password.js';
import { reportError } from './error-log.js';
import { MailQuotaError } from './mail-budget.js';
import type { Mailer } from './mailer.js';

export const RESET_TTL_MS = 3600_000;
/** Minimum wait between two reset emails to the same account; asking sooner is silently ignored */
export const RESET_COOLDOWN_MS = 60_000;
export const RESETS_PER_HOUR = 5;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

const escapeHtml = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function passwordResetMail(username: string, link: string) {
    const text = `Hi ${username},

Someone asked to reset the password of your GameQueue account (username: ${username}). Choose a new one here:

${link}

The link works once and expires in 1 hour. If this wasn't you, you can ignore this email; your password stays as it is.`;
    const html = `<p>Hi ${escapeHtml(username)},</p>
<p>Someone asked to reset the password of your GameQueue account (username: <strong>${escapeHtml(username)}</strong>). Choose a new one here:</p>
<p><a href="${escapeHtml(link)}">Reset my password</a></p>
<p>Or paste this link into your browser:<br>${escapeHtml(link)}</p>
<p>The link works once and expires in 1 hour. If this wasn't you, you can ignore this email; your password stays as it is.</p>`;
    return { subject: 'Reset your GameQueue password', text, html };
}

/**
 * Emails a reset link to the account with this address, if there is one. Returns nothing on
 * purpose: the route answers the same whether or not an account exists, and it doesn't wait for
 * the email provider either, since that wait would only happen for real accounts and its timing
 * would tell them apart. Never throws; a failed send is recorded for the admin error log. Asking
 * again within the cooldown, or more than `RESETS_PER_HOUR` times, sends nothing.
 */
export async function requestPasswordReset(
    db: Db,
    config: Pick<Config, 'publicUrl'>,
    mailer: Mailer | undefined,
    email: string,
    now = Date.now()
): Promise<void> {
    const user = db
        .select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .get();
    if (!user) return;
    const recent = db
        .select({ createdAt: passwordResets.createdAt })
        .from(passwordResets)
        .where(
            and(eq(passwordResets.userId, user.id), gt(passwordResets.createdAt, now - 3600_000))
        )
        .all();
    if (recent.length >= RESETS_PER_HOUR) return;
    if (recent.some((r) => r.createdAt > now - RESET_COOLDOWN_MS)) return;

    const token = randomBytes(32).toString('base64url');
    db.insert(passwordResets)
        .values({
            userId: user.id,
            tokenHash: hash(token),
            email: user.email,
            expiresAt: now + RESET_TTL_MS,
            createdAt: now
        })
        .run();
    const link = `${config.publicUrl}/reset-password?token=${token}`;
    if (!mailer) {
        // Local development: no email provider, so the link goes to the console
        console.log(`Password reset link for ${user.username}: ${link}`);
        return;
    }
    void mailer({ to: user.email, ...passwordResetMail(user.username, link) }).catch((e) => {
        // Already recorded as `email_quota`
        if (!(e instanceof MailQuotaError))
            reportError(db, 'email_failed', e, {
                context: { what: 'password-reset', userId: user.id }
            });
    });
}

/** Voids every pending reset link of the account; call it whenever its password changes. */
export const voidPasswordResets = (db: Pick<Db, 'delete'>, userId: number) =>
    void db.delete(passwordResets).where(eq(passwordResets.userId, userId)).run();

/**
 * Sets a new password from a token. Returns false when the token is unknown, expired, or was sent
 * to an address the account no longer has. Signs the
 * account out everywhere, voids its other reset links, and counts as confirming the email address
 * (the link only reached the inbox's owner).
 */
export async function resetPassword(
    db: Db,
    token: string,
    password: string,
    now = Date.now()
): Promise<boolean> {
    const row = db
        .select({
            userId: passwordResets.userId,
            email: passwordResets.email,
            expiresAt: passwordResets.expiresAt,
            currentEmail: users.email
        })
        .from(passwordResets)
        .innerJoin(users, eq(users.id, passwordResets.userId))
        .where(eq(passwordResets.tokenHash, hash(token)))
        .get();
    if (!row || row.expiresAt <= now || row.email !== row.currentEmail) return false;
    const passwordHash = await hashPassword(password);
    return db.transaction((tx) => {
        // Deleting first makes the token single-use even for two simultaneous requests
        const used = tx
            .delete(passwordResets)
            .where(eq(passwordResets.tokenHash, hash(token)))
            .run().changes;
        if (used === 0) return false;
        tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId)).run();
        tx.update(users)
            .set({ emailVerifiedAt: now })
            .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)))
            .run();
        voidPasswordResets(tx, row.userId);
        tx.delete(sessions).where(eq(sessions.userId, row.userId)).run();
        return true;
    });
}

export const purgeExpiredResets = (db: Db, now = Date.now()) =>
    void db.delete(passwordResets).where(lt(passwordResets.expiresAt, now)).run();
