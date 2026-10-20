import { z } from 'zod';

/** Procedural "identicon" for a username: deterministic, so it needs no storage and no server call. */

export const AVATAR_GRID = 5;

export interface Identicon {
    /** 0-359, drives the avatar colour. */
    hue: number;
    /** `cells[row][col]`, left-right mirrored, true = filled. */
    cells: boolean[][];
}

/** FNV-1a, 32 bit. */
function hashString(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** mulberry32: small seeded PRNG so one hash yields as many well-mixed bits as needed. */
function seededRandom(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function generateIdenticon(username: string): Identicon {
    const random = seededRandom(hashString(username.trim().toLowerCase()));
    const hue = Math.floor(random() * 360);
    const half = Math.ceil(AVATAR_GRID / 2);
    const cells = Array.from({ length: AVATAR_GRID }, () => {
        const left = Array.from({ length: half }, () => random() < 0.5);
        return [...left, ...left.slice(0, AVATAR_GRID - half).reverse()];
    });
    // An all-empty grid would be a blank square.
    if (!cells.some((row) => row.some(Boolean))) {
        cells[Math.floor(AVATAR_GRID / 2)] = Array.from(
            { length: AVATAR_GRID },
            (_, i) => i === half - 1
        );
    }
    return { hue, cells };
}

/** Uploaded avatars: the web client crops to a square and re-encodes, the server validates and stores the bytes. */
export const AVATAR_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
/** Edge length of the square the client produces. */
export const AVATAR_UPLOAD_SIZE = 256;
export const AVATAR_MAX_BYTES = 128 * 1024;

export const avatarUploadSchema = z.object({
    contentType: z.enum(AVATAR_CONTENT_TYPES),
    /** Base64 of the image bytes (the API only takes JSON bodies) */
    data: z
        .string()
        .max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4, 'That image is too large')
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Invalid image data')
});
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

/** Public URL of a user's uploaded avatar; `version` busts caches when it changes. */
export const avatarUrl = (username: string, version: number) =>
    `/api/profiles/${encodeURIComponent(username)}/avatar?v=${version}`;
