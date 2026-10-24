import { z } from 'zod';
import type { GameDto } from './collection.js';

export const MAX_TIER_LISTS = 50;
export const MAX_TIERS = 10;
/** Games across all tiers and the unranked pool of one tier list */
export const MAX_TIER_ITEMS = 100;
export const MAX_TIER_LIST_TITLE = 80;
export const MAX_TIER_LIST_DESCRIPTION = 300;
export const MAX_TIER_NAME = 24;

/**
 * Tier colours. Fixed hex values rather than theme tokens: the same in light and dark and in the
 * downloaded image, and each is light enough for dark text on top (all well above 4.5:1).
 */
export const TIER_COLORS = {
    red: '#f87171',
    orange: '#fb923c',
    yellow: '#facc15',
    green: '#4ade80',
    teal: '#2dd4bf',
    blue: '#60a5fa',
    purple: '#a78bfa',
    pink: '#f472b6',
    gray: '#cbd5e1'
} as const;
export type TierColor = keyof typeof TIER_COLORS;
export const TIER_COLOR_KEYS = Object.keys(TIER_COLORS) as [TierColor, ...TierColor[]];
/** Text on a tier colour */
export const TIER_INK = '#111c2e';

/** What a new tier list starts with, top to bottom. */
export const DEFAULT_TIERS: { name: string; color: TierColor }[] = [
    { name: 'S', color: 'red' },
    { name: 'A', color: 'orange' },
    { name: 'B', color: 'yellow' },
    { name: 'C', color: 'green' },
    { name: 'D', color: 'blue' },
    { name: 'F', color: 'purple' }
];

export interface TierItemDto {
    igdbId: number;
    game: GameDto;
}

export interface TierDto {
    id: number;
    name: string;
    color: TierColor;
    /** In order, left to right */
    items: TierItemDto[];
}

export interface TierListDto {
    id: number;
    title: string;
    description: string;
    /** Top to bottom */
    tiers: TierDto[];
    /** Games added but not placed in a tier yet, in order */
    unranked: TierItemDto[];
    createdAt: number;
    updatedAt: number;
}

export interface PublicTierListDto extends TierListDto {
    username: string;
}

/** A tier list as a tile on the tier lists page and the public profile. */
export interface TierListSummaryDto {
    id: number;
    title: string;
    /** Games in tiers (unranked ones don't count) */
    ranked: number;
    /** Cover image ids of the first few ranked games that have one, best tier first */
    covers: string[];
}

const title = z.string().trim().min(1).max(MAX_TIER_LIST_TITLE);
const description = z.string().trim().max(MAX_TIER_LIST_DESCRIPTION);
const tierName = z.string().trim().min(1).max(MAX_TIER_NAME);
const color = z.enum(TIER_COLOR_KEYS);
const id = z.number().int().positive();

export const createTierListSchema = z.object({
    title,
    description: description.optional()
});
export type CreateTierListInput = z.infer<typeof createTierListSchema>;

export const patchTierListSchema = z
    .object({ title, description })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchTierListInput = z.infer<typeof patchTierListSchema>;

export const addTierSchema = z.object({ name: tierName, color: color.default('gray') });
export type AddTierInput = z.infer<typeof addTierSchema>;

export const patchTierSchema = z
    .object({ name: tierName, color })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchTierInput = z.infer<typeof patchTierSchema>;

export const reorderTiersSchema = z.object({ tierIds: z.array(id) });

/** Adds a game to a tier (the end of it), or to the unranked pool when `tierId` is null/absent. */
export const addTierItemSchema = z.object({
    igdbId: id,
    tierId: id.nullable().optional()
});
export type AddTierItemInput = z.infer<typeof addTierItemSchema>;

/** Moves a game to `toIndex` of a tier, or of the unranked pool when `tierId` is null. */
export const moveTierItemSchema = z.object({
    igdbId: id,
    tierId: id.nullable(),
    toIndex: z.number().int().min(0)
});
export type MoveTierItemInput = z.infer<typeof moveTierItemSchema>;
