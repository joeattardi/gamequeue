import type { EntryDto, EntryStatus } from './collection.js';
import type { SocialLinks } from './social.js';

/** The part of an entry that is safe to show to anyone: no notes, no list/slot internals. */
export type PublicEntryDto = Pick<
    EntryDto,
    'id' | 'status' | 'rating' | 'ttbMinutes' | 'lastFinishedOn' | 'game' | 'platforms' | 'tags'
>;

export const toPublicEntry = (e: EntryDto): PublicEntryDto => ({
    id: e.id,
    status: e.status,
    rating: e.rating,
    ttbMinutes: e.ttbMinutes,
    lastFinishedOn: e.lastFinishedOn,
    game: e.game,
    platforms: e.platforms,
    tags: e.tags
});

export interface ProfileDto {
    username: string;
    /** See `UserDto.avatarUpdatedAt` */
    avatarUpdatedAt: number | null;
    /** Real name; only present when the user chose to show it on their profile */
    realName: string | null;
    socialLinks: SocialLinks;
    /** Account creation time, ms since epoch */
    joinedAt: number;
    slots: { name: string; entry: PublicEntryDto | null }[];
    summary: {
        total: number;
        queued: number;
        wishlisted: number;
        byStatus: Record<EntryStatus, number>;
    };
    lists: { id: number; name: string; entries: PublicEntryDto[] }[];
    /** Smart lists as they match right now, with their rules in words */
    smartLists: { id: number; name: string; description: string[]; entries: PublicEntryDto[] }[];
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

/** The `:year` of `/finished/:year`: a four-digit year, or this for finishes with no known date. */
export const FINISHED_UNKNOWN_YEAR = 'unknown';
export const isFinishedYear = (year: string) =>
    year === FINISHED_UNKNOWN_YEAR || /^\d{4}$/.test(year);

export interface ProfileGamesDto {
    username: string;
    view: ProfileView;
    /**
     * The queue in queue order (next game first); finished newest first (a year page: oldest
     * first); every other view sorted by title
     */
    entries: PublicEntryDto[];
    /** Finished view only: the year shown, if this is a year page */
    year?: string;
    /** Finished view only: years with finished playthroughs, newest first, then `unknown` */
    years?: { year: string; count: number }[];
}
