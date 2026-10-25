import { and, count, eq, ne } from 'drizzle-orm';
import {
    DEFAULT_SLOT_NAMES,
    type AdminCreateUserInput,
    type AdminUpdateUserInput,
    type AdminUserDto
} from '@gamequeue/shared';
import { hashPassword } from '../auth/password.js';
import { hashToken } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { entries, sessions, slots, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { getUserDto } from './users.js';

const taken = (field: 'username' | 'email') =>
    new HttpError(409, 'Invalid input', {
        details: [{ path: field, message: `That ${field} is already in use` }]
    });

function adminUserDto(db: Db, userId: number): AdminUserDto {
    const row = db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .get();
    const games = db.select({ n: count() }).from(entries).where(eq(entries.userId, userId)).get();
    return { ...getUserDto(db, userId), createdAt: row!.createdAt, gameCount: games?.n ?? 0 };
}

export function listUsers(db: Db): AdminUserDto[] {
    return db
        .select({ id: users.id })
        .from(users)
        .orderBy(users.username)
        .all()
        .map((u) => adminUserDto(db, u.id));
}

export function getUser(db: Db, userId: number): AdminUserDto {
    if (!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get())
        throw new HttpError(404, 'User not found');
    return adminUserDto(db, userId);
}

/** Reject a username/email that another user holds, naming the field. */
function assertFree(db: Db, input: { username: string; email: string }, exceptId?: number) {
    for (const field of ['username', 'email'] as const) {
        const hit = db
            .select({ id: users.id })
            .from(users)
            .where(eq(users[field], input[field]))
            .get();
        if (hit && hit.id !== exceptId) throw taken(field);
    }
}

/** The unique index stays the source of truth if two requests race past `assertFree`. */
function uniqueGuard<T>(fn: () => T): T {
    try {
        return fn();
    } catch (e) {
        if (e instanceof Error && /UNIQUE/.test(e.message))
            throw new HttpError(409, 'That username or email is already in use');
        throw e;
    }
}

export async function createUser(db: Db, input: AdminCreateUserInput): Promise<AdminUserDto> {
    assertFree(db, input);
    const passwordHash = await hashPassword(input.password);
    const id = uniqueGuard(() =>
        db.transaction((tx) => {
            const u = tx
                .insert(users)
                .values({
                    username: input.username,
                    email: input.email,
                    passwordHash,
                    role: input.role,
                    // The admin vouches for the address
                    emailVerifiedAt: Date.now()
                })
                .returning({ id: users.id })
                .get();
            tx.insert(slots)
                .values(
                    DEFAULT_SLOT_NAMES.map((name, position) => ({ userId: u.id, name, position }))
                )
                .run();
            return u.id;
        })
    );
    return adminUserDto(db, id);
}

const adminCount = (db: Db) =>
    db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get()?.n ?? 0;

/** Refuses to leave the instance with nobody who can reach the admin area. */
function assertNotLastAdmin(db: Db, target: { role: string }, action: string) {
    if (target.role === 'admin' && adminCount(db) <= 1)
        throw new HttpError(409, `You can't ${action} the last admin`);
}

export function updateUser(db: Db, userId: number, input: AdminUpdateUserInput): AdminUserDto {
    const current = db.select().from(users).where(eq(users.id, userId)).get();
    if (!current) throw new HttpError(404, 'User not found');
    if (input.role !== current.role) assertNotLastAdmin(db, current, 'demote');
    assertFree(db, input, userId);
    uniqueGuard(() =>
        db
            .update(users)
            .set({
                username: input.username,
                email: input.email,
                ...(input.email !== current.email ? { emailVerifiedAt: Date.now() } : {}),
                role: input.role,
                firstName: input.firstName,
                lastName: input.lastName,
                showRealName: input.showRealName,
                steamId: input.steam,
                xboxGamertag: input.xbox,
                psnId: input.playstation,
                discordName: input.discord
            })
            .where(eq(users.id, userId))
            .run()
    );
    return adminUserDto(db, userId);
}

/**
 * Sets a new password and signs the user out everywhere. When an admin resets their own password,
 * the session making the request (`keepToken`) survives.
 */
export async function resetPassword(
    db: Db,
    userId: number,
    password: string,
    keepToken?: string
): Promise<void> {
    if (!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get())
        throw new HttpError(404, 'User not found');
    const passwordHash = await hashPassword(password);
    db.transaction((tx) => {
        tx.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
        tx.delete(sessions)
            .where(
                keepToken
                    ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(keepToken)))
                    : eq(sessions.userId, userId)
            )
            .run();
    });
}

/** Deletes another user and everything they own (FK cascades; see `deleteAccount`). */
export function deleteUser(db: Db, userId: number, actingUserId: number): void {
    if (userId === actingUserId)
        throw new HttpError(409, "You can't delete your own account here. Use the Account page.");
    const target = db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) throw new HttpError(404, 'User not found');
    assertNotLastAdmin(db, target, 'delete');
    db.delete(users).where(eq(users.id, userId)).run();
}
