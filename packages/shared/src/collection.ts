import { z } from 'zod';
import type { PlaythroughDto } from './playthroughs.js';

export const ENTRY_STATUSES = ['unplayed', 'playing', 'paused', 'finished', 'abandoned'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_SORTS = ['title', 'added', 'release', 'rating', 'ttb'] as const;
export type EntrySort = (typeof ENTRY_SORTS)[number];

export interface PlatformDto {
    id: number;
    name: string;
    abbreviation: string | null;
}

export interface SearchResultDto {
    igdbId: number;
    name: string;
    year: number | null;
    coverImageId: string | null;
    /** IGDB's aggregated rating, 0-100 */
    igdbRating: number | null;
    platforms: PlatformDto[];
    /** Set when the game is already in the user's collection */
    entryId: number | null;
}

export interface GameDto {
    id: number;
    name: string;
    slug: string | null;
    summary: string | null;
    releaseDate: string | null;
    coverImageId: string | null;
    igdbRating: number | null;
    genres: string[];
    themes: string[];
    /** Platforms the game exists on, per IGDB */
    platforms: PlatformDto[];
    /** IGDB time-to-beat, in minutes */
    ttb: {
        hastily: number | null;
        normally: number | null;
        completely: number | null;
        count: number;
    } | null;
}

export interface EntryDto {
    id: number;
    status: EntryStatus;
    rating: number | null;
    notes: string;
    ttbOverrideMinutes: number | null;
    /** Override if set, otherwise IGDB "normally" */
    ttbMinutes: number | null;
    addedAt: number;
    game: GameDto;
    playthroughCount: number;
    /** The playthrough in progress (status playing or paused), if any */
    openPlaythrough: PlaythroughDto | null;
    /** End date of the most recent finished playthrough, if known */
    lastFinishedOn: string | null;
    /** The slot it currently occupies, if any */
    slotId: number | null;
    /** Lists it belongs to (the queue is separate, see `queued`) */
    lists: { id: number; name: string }[];
    /** On the queue */
    queued: boolean;
    /** Platforms the user owns it on */
    platforms: PlatformDto[];
    tags: string[];
}

export interface FacetsDto {
    platforms: PlatformDto[];
    tags: string[];
    genres: { id: number; name: string }[];
}

const tagSchema = z.string().trim().min(1).max(40);
export const tagsSchema = z.array(tagSchema).max(50);

export const addEntrySchema = z.object({
    igdbId: z.number().int().positive(),
    platformIds: z.array(z.number().int().positive()).min(1, 'Pick at least one platform').max(30),
    /** Omit to pre-fill from IGDB genres and themes */
    tags: tagsSchema.optional()
});
export type AddEntryInput = z.infer<typeof addEntrySchema>;

export const patchEntrySchema = z
    .object({
        rating: z.number().int().min(1).max(10).nullable(),
        notes: z.string().max(10_000),
        ttbOverrideMinutes: z.number().int().min(1).max(60_000).nullable(),
        platformIds: z
            .array(z.number().int().positive())
            .min(1, 'Pick at least one platform')
            .max(30),
        tags: tagsSchema
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchEntryInput = z.infer<typeof patchEntrySchema>;

const csvNumber = z.coerce.number().int().positive();
export const entryQuerySchema = z.object({
    view: z.enum(['all', 'backlog']).default('all'),
    status: z.enum(ENTRY_STATUSES).optional(),
    platform: csvNumber.optional(),
    genre: csvNumber.optional(),
    tag: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(ENTRY_SORTS).default('title'),
    dir: z.enum(['asc', 'desc']).optional()
});
export type EntryQuery = z.infer<typeof entryQuerySchema>;

export const searchQuerySchema = z.object({
    q: z.string().trim().min(2, 'Type at least 2 characters').max(100)
});
