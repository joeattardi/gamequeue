import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'gq_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: Db, userId: number, now = Date.now()) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_TTL_MS;
    db.insert(sessions)
        .values({ id: hashToken(token), userId, expiresAt })
        .run();
    return { token, expiresAt };
}

/** Returns the user for a raw token, or undefined. Slides expiry when past half-life. */
export function resolveSession(db: Db, token: string, now = Date.now()) {
    const id = hashToken(token);
    const row = db
        .select({
            expiresAt: sessions.expiresAt,
            userId: users.id,
            username: users.username,
            email: users.email,
            role: users.role,
            emailVerifiedAt: users.emailVerifiedAt
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, id))
        .get();
    if (!row) return undefined;
    if (row.expiresAt <= now) {
        db.delete(sessions).where(eq(sessions.id, id)).run();
        return undefined;
    }
    let expiresAt = row.expiresAt;
    if (expiresAt - now < SESSION_TTL_MS / 2) {
        expiresAt = now + SESSION_TTL_MS;
        db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
    }
    return {
        user: {
            id: row.userId,
            username: row.username,
            email: row.email,
            role: row.role,
            emailVerified: row.emailVerifiedAt !== null
        },
        expiresAt,
        renewed: expiresAt !== row.expiresAt
    };
}

export const destroySession = (db: Db, token: string) =>
    void db
        .delete(sessions)
        .where(eq(sessions.id, hashToken(token)))
        .run();

export const purgeExpiredSessions = (db: Db, now = Date.now()) =>
    void db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
