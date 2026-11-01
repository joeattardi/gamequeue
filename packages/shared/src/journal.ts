import { z } from 'zod';
import { playtimeSchema } from './playthroughs.js';

/** What a journal post is: written text, screenshots with an optional caption, or hours played. */
const POST_KINDS = ['note', 'screenshot', 'hours'] as const;
type PostKind = (typeof POST_KINDS)[number];

/** Who can read a playthrough's journal: only the owner, anyone with the link, or everyone (and on the profile). */
export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
const visibilitySchema = z.enum(VISIBILITIES);

export const MAX_POST_BODY = 4000;
export const MAX_IMAGES_PER_POST = 6;
/** Largest original image accepted; what is stored is re-encoded and much smaller */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Stored images are scaled down to at most this many pixels on the longest side */
export const IMAGE_MAX_SIDE = 1920;
export const IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Default cap on all stored screenshots; an admin can change it */
export const DEFAULT_SCREENSHOT_CAP_BYTES = 1024 ** 3;

export interface PostImageDto {
    id: number;
    width: number;
    height: number;
    bytes: number;
}

export interface PostDto {
    id: number;
    playthroughId: number;
    kind: PostKind;
    /** Note text, or a screenshot caption, or an optional remark on logged hours */
    body: string;
    /** Hours posts only */
    minutes: number | null;
    spoiler: boolean;
    createdAt: number;
    images: PostImageDto[];
}

const body = z.string().trim().max(MAX_POST_BODY);

export const createPostSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('note'),
        body: body.min(1, 'Write something first'),
        spoiler: z.boolean().optional()
    }),
    z.object({
        kind: z.literal('hours'),
        minutes: playtimeSchema,
        body: body.optional(),
        spoiler: z.boolean().optional()
    }),
    z.object({
        kind: z.literal('screenshot'),
        body: body.optional(),
        spoiler: z.boolean().optional()
    })
]);
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const patchPostSchema = z
    .object({ body, minutes: playtimeSchema, spoiler: z.boolean() })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchPostInput = z.infer<typeof patchPostSchema>;

export const setVisibilitySchema = z.object({ visibility: visibilitySchema });

/** A journal as a visitor sees it: no ids that could be used to reach the owner's other data. */
export interface JournalDto {
    slug: string;
    game: { id: number; name: string; coverImageId: string | null };
    owner: { username: string };
    platform: { name: string; abbreviation: string | null } | null;
    startedOn: string | null;
    endedOn: string | null;
    outcome: 'finished' | 'abandoned' | null;
    rating: number | null;
    playtimeMinutes: number | null;
    finalThoughts: string;
    /** Newest first */
    posts: JournalPostDto[];
}

export interface JournalPostDto {
    id: number;
    kind: PostKind;
    body: string;
    minutes: number | null;
    spoiler: boolean;
    createdAt: number;
    images: PostImageDto[];
}

/** A public journal in a list on the owner's profile */
export interface ProfileJournalDto {
    slug: string;
    game: { id: number; name: string; coverImageId: string | null };
    outcome: 'finished' | 'abandoned' | null;
    startedOn: string | null;
    endedOn: string | null;
    rating: number | null;
    posts: number;
}

/** The admin's view of screenshot storage */
export interface ScreenshotStorageDto {
    usedBytes: number;
    capBytes: number;
    files: number;
    freeDiskBytes: number | null;
}
export const setScreenshotCapSchema = z.object({
    capBytes: z
        .number()
        .int()
        .min(0)
        .max(1024 ** 4)
});
