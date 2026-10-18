import { z } from 'zod';
import type { EntryDto } from './collection.js';

export interface ListSummaryDto {
    id: number;
    name: string;
    count: number;
    /** Cover image ids of the first few games (in list order) that have one, for the list tile */
    covers: string[];
}

export interface ListDetailDto {
    id: number;
    name: string;
    kind: 'list' | 'queue';
    /** In list order */
    entries: EntryDto[];
}

const listName = z.string().trim().min(1, 'Give the list a name').max(60);

export const createListSchema = z.object({ name: listName });
export const patchListSchema = z.object({ name: listName });
export const addListItemSchema = z.object({ entryId: z.number().int().positive() });
export const reorderListSchema = z.object({ entryIds: z.array(z.number().int().positive()) });
