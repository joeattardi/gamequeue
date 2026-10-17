import { z } from 'zod';
import type { EntryDto } from './collection.js';
import { isoDateSchema } from './playthroughs.js';

export const MAX_SLOTS = 10;

export interface SlotDto {
    id: number;
    name: string;
    position: number;
    entry: EntryDto | null;
}

const slotName = z.string().trim().min(1, 'Give the slot a name').max(40);

export const createSlotSchema = z.object({ name: slotName });
export const patchSlotSchema = z.object({ name: slotName });

export const assignSlotSchema = z.object({
    entryId: z.number().int().positive(),
    /** Needed when the game has to be started and is owned on several platforms */
    platformId: z.number().int().positive().optional(),
    /** Start date if the game has to be started (defaults to today) */
    date: isoDateSchema.optional(),
    /** Confirms replacing the current occupant (who is paused) */
    replace: z.boolean().optional()
});

export const reorderSlotsSchema = z.object({
    ids: z.array(z.number().int().positive()).max(MAX_SLOTS)
});

export type AssignSlotInput = z.infer<typeof assignSlotSchema>;
