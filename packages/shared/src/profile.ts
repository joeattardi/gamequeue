import type { EntryDto, EntryStatus } from './collection.js';

/** The part of an entry that is safe to show to anyone: no notes, no list/slot internals. */
export type PublicEntryDto = Pick<
    EntryDto,
    'id' | 'status' | 'rating' | 'ttbMinutes' | 'lastFinishedOn' | 'game' | 'platforms' | 'tags'
>;

export interface ProfileDto {
    username: string;
    /** Account creation time, ms since epoch */
    joinedAt: number;
    slots: { name: string; entry: PublicEntryDto | null }[];
    summary: { total: number; byStatus: Record<EntryStatus, number> };
    lists: { id: number; name: string; entries: PublicEntryDto[] }[];
}

export interface ProfileQueueDto {
    username: string;
    /** In queue order, next game first */
    entries: PublicEntryDto[];
}
