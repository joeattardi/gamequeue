import { z } from 'zod';
import { ratingSchema, type PlatformDto } from './collection.js';
import { isValidIsoDate } from './status.js';
import type { Visibility } from './journal.js';

export interface PlaythroughDto {
    id: number;
    entryId: number;
    platform: PlatformDto | null;
    /** YYYY-MM-DD; null when unknown (e.g. a game finished years ago) */
    startedOn: string | null;
    endedOn: string | null;
    /** null while the playthrough is open */
    outcome: 'finished' | 'abandoned' | null;
    rating: number | null;
    /** Total time played, in minutes; null when not recorded */
    playtimeMinutes: number | null;
    /** Reflections written when finishing; shown on the journal */
    finalThoughts: string;
    /** Who can read this playthrough's journal */
    visibility: Visibility;
    /** The journal's link token (`/p/:slug`); null while private */
    shareSlug: string | null;
    /** Sum of the hours posts in the journal; what the finish dialog pre-fills the total with */
    loggedMinutes: number;
}

export const isoDateSchema = z.string().refine(isValidIsoDate, 'Use a valid date (YYYY-MM-DD)');
const platformIdSchema = z.number().int().positive();
export const MAX_PLAYTIME_MINUTES = 600_000;
export const playtimeSchema = z.number().int().min(1).max(MAX_PLAYTIME_MINUTES);
export const MAX_FINAL_THOUGHTS = 4000;
export const finalThoughtsSchema = z.string().trim().max(MAX_FINAL_THOUGHTS);

export const startSchema = z.object({
    platformId: platformIdSchema.optional(),
    date: isoDateSchema.optional(),
    /** Open the playthrough already paused, for a game you started before tracking it */
    paused: z.boolean().optional()
});

export const closeSchema = z.object({
    date: isoDateSchema.optional(),
    rating: ratingSchema.nullable().optional(),
    playtimeMinutes: playtimeSchema.nullable().optional(),
    finalThoughts: finalThoughtsSchema.optional()
});

export const logPlaythroughSchema = z.object({
    outcome: z.enum(['finished', 'abandoned']),
    platformId: platformIdSchema.optional(),
    startedOn: isoDateSchema.nullable().optional(),
    endedOn: isoDateSchema.nullable().optional(),
    rating: ratingSchema.nullable().optional(),
    playtimeMinutes: playtimeSchema.nullable().optional()
});

export const patchPlaythroughSchema = z
    .object({
        outcome: z.enum(['finished', 'abandoned']),
        platformId: platformIdSchema,
        startedOn: isoDateSchema.nullable(),
        endedOn: isoDateSchema.nullable(),
        rating: ratingSchema.nullable(),
        playtimeMinutes: playtimeSchema.nullable(),
        finalThoughts: finalThoughtsSchema
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type StartInput = z.infer<typeof startSchema>;
export type CloseInput = z.infer<typeof closeSchema>;
export type LogPlaythroughInput = z.infer<typeof logPlaythroughSchema>;
export type PatchPlaythroughInput = z.infer<typeof patchPlaythroughSchema>;
