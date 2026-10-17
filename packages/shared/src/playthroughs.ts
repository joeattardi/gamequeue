import { z } from 'zod';
import type { PlatformDto } from './collection.js';
import { isValidIsoDate } from './status.js';

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
}

export const isoDateSchema = z.string().refine(isValidIsoDate, 'Use a valid date (YYYY-MM-DD)');
const ratingSchema = z.number().int().min(1).max(10);
const platformIdSchema = z.number().int().positive();

export const startSchema = z.object({
    platformId: platformIdSchema.optional(),
    date: isoDateSchema.optional()
});

export const closeSchema = z.object({
    date: isoDateSchema.optional(),
    rating: ratingSchema.nullable().optional()
});

export const logPlaythroughSchema = z.object({
    outcome: z.enum(['finished', 'abandoned']),
    platformId: platformIdSchema.optional(),
    startedOn: isoDateSchema.nullable().optional(),
    endedOn: isoDateSchema.nullable().optional(),
    rating: ratingSchema.nullable().optional()
});

export const patchPlaythroughSchema = z
    .object({
        outcome: z.enum(['finished', 'abandoned']),
        platformId: platformIdSchema,
        startedOn: isoDateSchema.nullable(),
        endedOn: isoDateSchema.nullable(),
        rating: ratingSchema.nullable()
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type StartInput = z.infer<typeof startSchema>;
export type CloseInput = z.infer<typeof closeSchema>;
export type LogPlaythroughInput = z.infer<typeof logPlaythroughSchema>;
export type PatchPlaythroughInput = z.infer<typeof patchPlaythroughSchema>;
