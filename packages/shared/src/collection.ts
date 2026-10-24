import { z } from 'zod';
import type { PlaythroughDto } from './playthroughs.js';
import { isValidIsoDate } from './status.js';
import type { ReleasePrecision } from './release.js';
import type { SeriesRefDto } from './series.js';

export const ENTRY_STATUSES = ['unplayed', 'playing', 'paused', 'finished', 'abandoned'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Ratings are whole stars, 1 to RATING_MAX */
export const RATING_MAX = 5;
export const ratingSchema = z.number().int().min(1).max(RATING_MAX);

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
    /** On the user's wishlist */
    wishlisted: boolean;
}

/** A game IGDB lists as similar to another, with what the user has of it */
export interface SimilarGameDto {
    igdbId: number;
    name: string;
    year: number | null;
    coverImageId: string | null;
    /** IGDB's aggregated rating, 0-100 */
    igdbRating: number | null;
    /** Set when the game is in the user's collection */
    entryId: number | null;
    /** On the user's wishlist */
    wishlisted: boolean;
}

export interface GameDto {
    id: number;
    name: string;
    slug: string | null;
    summary: string | null;
    releaseDate: string | null;
    /** How exact `releaseDate` is; null means unknown (treat as a day) */
    releasePrecision: ReleasePrecision | null;
    coverImageId: string | null;
    /** IGDB image ids of a few screenshots; empty until looked up or when there are none */
    screenshots: string[];
    igdbRating: number | null;
    /** IGDB series the game belongs to; empty until looked up or when it has none */
    series: SeriesRefDto[];
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

/** A game seen from outside the collection: its metadata plus what the user has done with it */
export interface GameDetailDto {
    game: GameDto;
    /** Set when the game is in the user's collection */
    entryId: number | null;
    /** On the user's wishlist */
    wishlisted: boolean;
}

export interface EntryDto {
    id: number;
    status: EntryStatus;
    rating: number | null;
    /** Marked as a favorite; independent of rating and lists */
    favorite: boolean;
    notes: string;
    ttbOverrideMinutes: number | null;
    /** Override if set, otherwise IGDB "normally" */
    ttbMinutes: number | null;
    addedAt: number;
    /** Last time its status, rating, notes, tags or platforms changed (not favoriting), ms since epoch */
    updatedAt: number;
    game: GameDto;
    playthroughCount: number;
    /** The playthrough in progress (status playing or paused), if any */
    openPlaythrough: PlaythroughDto | null;
    /** End date of the most recent finished playthrough, if known */
    lastFinishedOn: string | null;
    /** Every year with a finished playthrough that has a known end date, oldest first */
    finishedYears: number[];
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
    /** Years something was finished in, newest first (for the smart list editor) */
    finishedYears: number[];
}

/** One page of games from `GET /entries`; `total` counts every match, not just this page */
export interface EntriesPageDto {
    entries: EntryDto[];
    total: number;
}

/** Facet sidebar: every option the user has, with how many games match the other active facets */
export interface FacetCountsDto {
    statuses: { value: EntryStatus; count: number }[];
    platforms: (PlatformDto & { count: number })[];
    genres: { id: number; name: string; count: number }[];
    /** Only series with at least two of the user's games, since one-game series filter nothing */
    series: { id: number; name: string; count: number }[];
    tags: { name: string; count: number }[];
    /** Games marked as favorites, given the other active facets */
    favorites: number;
}

const tagSchema = z.string().trim().min(1).max(60);
export const tagsSchema = z.array(tagSchema).max(50);

export const addEntrySchema = z.object({
    igdbId: z.number().int().positive(),
    platformIds: z.array(z.number().int().positive()).min(1, 'Pick at least one platform').max(30),
    /** Omit to pre-fill from IGDB genres and themes */
    tags: tagsSchema.optional(),
    /**
     * Add a game you already have history with. `paused` opens a playthrough (started on `date`,
     * default today) and pauses it; `abandoned` logs a closed playthrough with unknown dates.
     */
    status: z.enum(['unplayed', 'paused', 'abandoned']).optional(),
    date: z.string().refine(isValidIsoDate, 'Use a valid date (YYYY-MM-DD)').optional()
});
export type AddEntryInput = z.infer<typeof addEntrySchema>;

export const patchEntrySchema = z
    .object({
        rating: ratingSchema.nullable(),
        favorite: z.boolean(),
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

/** A facet: repeatable query param (`?tag=a&tag=b`), any-of within the facet. A lone value is fine. */
const multi = <T extends z.ZodType>(item: T) =>
    z.preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(item).max(100));
const positiveInt = z.coerce.number().int().positive();
export const entryQuerySchema = z.object({
    view: z.enum(['all', 'backlog']).default('all'),
    status: multi(z.enum(ENTRY_STATUSES)).optional(),
    platform: multi(positiveInt).optional(),
    genre: multi(positiveInt).optional(),
    series: multi(positiveInt).optional(),
    tag: multi(z.string().trim().min(1)).optional(),
    /** `favorite=true`: favorites only */
    favorite: z.literal('true').optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(ENTRY_SORTS).default('title'),
    dir: z.enum(['asc', 'desc']).optional()
});
export type EntryQuery = z.infer<typeof entryQuerySchema>;

export const searchQuerySchema = z.object({
    q: z.string().trim().min(2, 'Type at least 2 characters').max(100)
});
