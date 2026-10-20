import { eq } from 'drizzle-orm';
import { AVATAR_MAX_BYTES, type AvatarContentType } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { avatars, users } from '../db/schema.js';
import { HttpError } from '../errors.js';

/** The declared type must match the file's magic bytes, so the stored bytes are what they claim to be. */
function matchesType(bytes: Buffer, type: AvatarContentType): boolean {
    switch (type) {
        case 'image/png':
            return bytes
                .subarray(0, 8)
                .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        case 'image/jpeg':
            return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        case 'image/webp':
            return (
                bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
                bytes.subarray(8, 12).toString('latin1') === 'WEBP'
            );
    }
}

export function setAvatar(db: Db, userId: number, contentType: AvatarContentType, base64: string) {
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0 || !matchesType(data, contentType))
        throw new HttpError(400, "That isn't a valid image");
    if (data.length > AVATAR_MAX_BYTES) throw new HttpError(400, 'That image is too large');
    const updatedAt = Date.now();
    db.insert(avatars)
        .values({ userId, contentType, data, updatedAt })
        .onConflictDoUpdate({ target: avatars.userId, set: { contentType, data, updatedAt } })
        .run();
    return updatedAt;
}

export function removeAvatar(db: Db, userId: number) {
    db.delete(avatars).where(eq(avatars.userId, userId)).run();
}

/** Version (last change, ms) of a user's avatar, null when they use the generated one. */
export function avatarVersion(db: Db, userId: number): number | null {
    return (
        db
            .select({ updatedAt: avatars.updatedAt })
            .from(avatars)
            .where(eq(avatars.userId, userId))
            .get()?.updatedAt ?? null
    );
}

export function getAvatarByUsername(db: Db, username: string) {
    return db
        .select({ contentType: avatars.contentType, data: avatars.data })
        .from(avatars)
        .innerJoin(users, eq(users.id, avatars.userId))
        .where(eq(users.username, username))
        .get();
}
