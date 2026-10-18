import { z } from 'zod';
import type { GameDto, PlatformDto } from './collection.js';

/** A game the user wants but doesn't own: it has no status, playthroughs or slot. */
export interface WishlistItemDto {
    igdbId: number;
    game: GameDto;
    /** The platform the user means to buy it on, if decided */
    platform: PlatformDto | null;
    note: string;
    addedAt: number;
}

export interface WishlistDto {
    id: number;
    name: string;
    /** In wishlist order */
    items: WishlistItemDto[];
}

/** What anyone may see of a wishlist: no notes. */
export type PublicWishlistItemDto = Pick<WishlistItemDto, 'igdbId' | 'game' | 'platform'>;

export interface ProfileWishlistDto {
    username: string;
    items: PublicWishlistItemDto[];
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

export const reorderWishlistSchema = z.object({
    igdbIds: z.array(z.number().int().positive())
});
