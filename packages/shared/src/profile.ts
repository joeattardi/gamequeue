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
    summary: { total: number; queued: number; byStatus: Record<EntryStatus, number> };
    lists: { id: number; name: string; entries: PublicEntryDto[] }[];
}

/** The sub-pages of a public profile, each a plain list of games (`/u/:username/:view`). */
export const PROFILE_VIEWS = [
    'queue',
    'collection',
    'backlog',
    'playing',
    'paused',
    'finished',
    'abandoned'
] as const;
export type ProfileView = (typeof PROFILE_VIEWS)[number];

export interface ProfileGamesDto {
    username: string;
    view: ProfileView;
    /** The queue in queue order (next game first); every other view sorted by title */
    entries: PublicEntryDto[];
}
