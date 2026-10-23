import { z } from 'zod';
import type { GameDto, PlatformDto } from './collection.js';
import { moveItemSchema } from './pagination.js';

/** The best current price of a game, from IsThereAnyDeal. Amounts are minor units (cents). */
export interface GamePriceDto {
    currency: string;
    /** Cheapest current price across the shops */
    amount: number;
    /** That shop's regular price; equals `amount` when nothing is discounted */
    regular: number;
    /** Percent off, 0 when not on sale */
    cut: number;
    shop: string;
    /** ITAD link that forwards to the shop's page for the game */
    url: string;
    /** Lowest price ever recorded, if ITAD has one */
    historyLow: number | null;
    /** When ITAD was last asked (ms since epoch) */
    checkedAt: number;
}

/** A game the user wants but doesn't own: it has no status, playthroughs or slot. */
export interface WishlistItemDto {
    igdbId: number;
    game: GameDto;
    /** The platform the user means to buy it on, if decided */
    platform: PlatformDto | null;
    note: string;
    addedAt: number;
    /** Null when prices are off, the game wasn't found at ITAD, or no shop sells it */
    price: GamePriceDto | null;
}

export interface WishlistDto {
    id: number;
    name: string;
    /** One page, in wishlist order */
    items: WishlistItemDto[];
    /** Games on the whole wishlist */
    total: number;
}

/** What anyone may see of a wishlist: no notes. */
export type PublicWishlistItemDto = Pick<WishlistItemDto, 'igdbId' | 'game' | 'platform'>;

export interface ProfileWishlistDto {
    username: string;
    items: PublicWishlistItemDto[];
    total: number;
}

export const MAX_WISHLIST_NOTE = 1000;

export const addWishlistItemSchema = z.object({
    igdbId: z.number().int().positive(),
    platformId: z.number().int().positive().nullable().optional(),
    note: z.string().max(MAX_WISHLIST_NOTE).optional()
});
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;

export const patchWishlistItemSchema = z
    .object({
        platformId: z.number().int().positive().nullable(),
        note: z.string().max(MAX_WISHLIST_NOTE)
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchWishlistItemInput = z.infer<typeof patchWishlistItemSchema>;

export const moveWishlistItemSchema = moveItemSchema.extend({
    igdbId: z.number().int().positive()
});
export const reorderWishlistSchema = z.object({
    igdbIds: z.array(z.number().int().positive())
});

/** `GET /wishlist/releasing-soon`: `today` is the client's local date, like playthrough dates. */
export const releasingSoonQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(14),
    today: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
});
