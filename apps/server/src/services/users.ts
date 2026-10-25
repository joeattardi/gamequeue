import { and, eq, ne } from 'drizzle-orm';
import type {
    AccountProfileInput,
    ActivityVisibilityInput,
    BioInput,
    ProfileBadge,
    SearchIndexingInput,
    SocialLinks,
    SocialLinksInput,
    UserDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { hashToken } from '../auth/sessions.js';
import { sessions, users } from '../db/schema.js';
import { avatarIconOf, avatarVersion } from './avatars.js';
import { voidPasswordResets } from './password-reset.js';

type UserRow = typeof users.$inferSelect;

/** Founder wins over staff, so the founder (who is also an admin) shows one badge. */
export function profileBadge(
    user: { id: number; role: string },
    founderUserId?: number
): ProfileBadge | null {
    if (founderUserId !== undefined && user.id === founderUserId) return 'founder';
    return user.role === 'admin' ? 'staff' : null;
}

export const socialLinksOf = (row: UserRow): SocialLinks => ({
    steam: row.steamId,
    xbox: row.xboxGamertag,
    playstation: row.psnId,
    discord: row.discordName
});

/** The signed-in user as the web client sees it (`/auth/me`, login, register). */
export function getUserDto(db: Db, userId: number): UserDto {
    const row = db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new Error(`User ${userId} not found`);
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        emailVerified: row.emailVerifiedAt !== null,
        role: row.role,
        avatarUpdatedAt: avatarVersion(db, row.id),
        avatarIcon: avatarIconOf(row),
        firstName: row.firstName,
        lastName: row.lastName,
        showRealName: row.showRealName,
        bio: row.bio,
        socialLinks: socialLinksOf(row),
        searchIndexable: row.searchIndexable,
        showActivity: row.showActivity
    };
}

export function updateSearchIndexing(db: Db, userId: number, input: SearchIndexingInput) {
    db.update(users).set(input).where(eq(users.id, userId)).run();
    return getUserDto(db, userId);
}

export function updateActivityVisibility(db: Db, userId: number, input: ActivityVisibilityInput) {
    db.update(users).set(input).where(eq(users.id, userId)).run();
    return getUserDto(db, userId);
}

export function updateBio(db: Db, userId: number, input: BioInput) {
    db.update(users).set(input).where(eq(users.id, userId)).run();
    return getUserDto(db, userId);
}

export function updateAccountProfile(db: Db, userId: number, input: AccountProfileInput) {
    db.update(users).set(input).where(eq(users.id, userId)).run();
    return getUserDto(db, userId);
}

export function updateSocialLinks(db: Db, userId: number, input: SocialLinksInput) {
    db.update(users)
        .set({
            steamId: input.steam,
            xboxGamertag: input.xbox,
            psnId: input.playstation,
            discordName: input.discord
        })
        .where(eq(users.id, userId))
        .run();
    return getUserDto(db, userId);
}

/**
 * Changes the password after checking the current one. Every other session of the user is signed
 * out (the one making the request stays), so a leaked session can't outlive a password change.
 * Returns false when the current password is wrong.
 */
export async function changePassword(
    db: Db,
    userId: number,
    currentToken: string | undefined,
    currentPassword: string,
    newPassword: string
): Promise<boolean> {
    const row = db
        .select({ hash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .get();
    if (!row || !(await verifyPassword(row.hash, currentPassword))) return false;
    const passwordHash = await hashPassword(newPassword);
    db.transaction((tx) => {
        tx.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
        voidPasswordResets(tx, userId);
        tx.delete(sessions)
            .where(
                currentToken
                    ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(currentToken)))
                    : eq(sessions.userId, userId)
            )
            .run();
    });
    return true;
}

/**
 * Permanently deletes the user. Everything they own (entries, playthroughs, slots, lists, wishlist,
 * tags, smart lists, avatar, sessions) goes with the row through `ON DELETE cascade`; the shared
 * game metadata cache stays. Returns false when the password is wrong.
 */
export async function deleteAccount(db: Db, userId: number, password: string): Promise<boolean> {
    const row = db
        .select({ hash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .get();
    if (!row || !(await verifyPassword(row.hash, password))) return false;
    db.delete(users).where(eq(users.id, userId)).run();
    return true;
}
