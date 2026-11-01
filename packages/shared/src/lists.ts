import { z } from 'zod';
import type { EntryDto, GameDto } from './collection.js';
import { moveItemSchema } from './pagination.js';

export interface ListSummaryDto {
    id: number;
    name: string;
    count: number;
    /** Cover image ids of the first few games (in list order) that have one, for the list tile */
    covers: string[];
}

/** A game on a list. `entry` is the collection entry when the user owns the game, else null. */
export interface ListItemDto {
    igdbId: number;
    game: GameDto;
    entry: EntryDto | null;
}

export interface ListDetailDto {
    id: number;
    name: string;
    kind: 'list' | 'queue' | 'wishlist';
    /** What the owner wrote about the list; empty if nothing (always empty for the queue) */
    description: string;
    /** One page, in list order */
    items: ListItemDto[];
    /** Games in the whole list */
    total: number;
}

const listName = z.string().trim().min(1, 'Give the list a name').max(60);

export const MAX_LIST_DESCRIPTION = 500;
export const listDescription = z.string().trim().max(MAX_LIST_DESCRIPTION);

export const createListSchema = z.object({
    name: listName,
    description: listDescription.default('')
});
/** Rename and/or re-describe; whatever is left out stays as it is */
export const patchListSchema = z
    .object({ name: listName, description: listDescription })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type PatchListInput = z.infer<typeof patchListSchema>;
/** Items are addressed by IGDB game id, owned or not. */
export const addListItemSchema = z.object({ igdbId: z.number().int().positive() });
export const moveListItemSchema = moveItemSchema.extend({ igdbId: z.number().int().positive() });
export const reorderListSchema = z.object({ igdbIds: z.array(z.number().int().positive()) });

/** The entries of the games a list holds that the user owns, in list order (CSV, pick). */
export const ownedEntries = (items: ListItemDto[]): EntryDto[] =>
    items.flatMap((i) => (i.entry ? [i.entry] : []));
