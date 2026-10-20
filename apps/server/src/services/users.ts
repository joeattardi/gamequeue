import { eq } from 'drizzle-orm';
import type { AccountProfileInput, UserDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { avatarVersion } from './avatars.js';

/** The signed-in user as the web client sees it (`/auth/me`, login, register). */
export function getUserDto(db: Db, userId: number): UserDto {
    const row = db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new Error(`User ${userId} not found`);
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUpdatedAt: avatarVersion(db, row.id),
        firstName: row.firstName,
        lastName: row.lastName,
        showRealName: row.showRealName
    };
}

export function updateAccountProfile(db: Db, userId: number, input: AccountProfileInput) {
    db.update(users).set(input).where(eq(users.id, userId)).run();
    return getUserDto(db, userId);
}
