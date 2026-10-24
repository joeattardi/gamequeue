import type { EntryDto, EntryStatus, GameDto } from './collection.js';
import type { GridSummaryDto } from './grids.js';
import type { TierListSummaryDto } from './tiers.js';
import type { SocialLinks } from './social.js';
import type { ActivityEventDto } from './activity.js';

/** The part of an entry that is safe to show to anyone: no notes, no list/slot internals. */
export type PublicEntryDto = Pick<
    EntryDto,
    | 'id'
    | 'status'
    | 'rating'
    | 'favorite'
    | 'ttbMinutes'
    | 'lastFinishedOn'
    | 'game'
    | 'platforms'
    | 'tags'
>;

export const toPublicEntry = (e: EntryDto): PublicEntryDto => ({
    id: e.id,
    status: e.status,
    rating: e.rating,
    favorite: e.favorite,
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
    /** One-line tagline the owner wrote; null = none */
    bio: string | null;
    socialLinks: SocialLinks;
    /** Account creation time, ms since epoch */
    joinedAt: number;
    slots: { name: string; entry: PublicEntryDto | null }[];
    summary: {
        total: number;
        queued: number;
        wishlisted: number;
        favorites: number;
        byStatus: Record<EntryStatus, number>;
    };
    /** Tiles only: the games themselves are on each list's own page */
    lists: ProfileListTileDto[];
    /** Smart lists as they match right now, with their rules in words */
    smartLists: ProfileListTileDto[];
    grids: GridSummaryDto[];
    tierLists: TierListSummaryDto[];
    /** Latest finishes with a known date, newest first (a short highlight row) */
    recentlyFinished: PublicEntryDto[];
    /** Favorites, best rated first (a short highlight row) */
    favoriteGames: PublicEntryDto[];
    /**
     * The latest events (raw, so the web client can group runs of them) and how many there are in
     * all; null when the owner hides their activity
     */
    activity: { events: ActivityEventDto[]; total: number } | null;
}

export interface ProfileListTileDto {
    id: number;
    name: string;
    /** Games in it (for a smart list, matching right now) */
    total: number;
    /** Cover image ids of the first few games that have one */
    covers: string[];
}

/** One list on the profile, a page at a time (`/profiles/:username/lists/:id`, `/smart-lists/:id`). */
export interface ProfileListPageDto {
    name: string;
    /** What the owner wrote about the list; empty if nothing */
    description: string;
    /** Smart lists only: the rules in words */
    ruleText?: string[];
    entries: PublicEntryDto[];
    total: number;
}

/** The sub-pages of a public profile, each a plain list of games (`/u/:username/:view`). */
export const PROFILE_VIEWS = [
    'queue',
    'collection',
    'favorites',
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
    /** Games in the whole view; `entries` is one page */
    total: number;
    /** Finished view only: the year shown, if this is a year page */
    year?: string;
    /** Finished view only: years with finished playthroughs, newest first, then `unknown` */
    years?: { year: string; count: number }[];
}

/**
 * One game on someone's public profile (`/profiles/:username/games/:igdbId`): IGDB's cached data
 * plus what that user has of it. No notes.
 */
export interface ProfileGameDto {
    username: string;
    game: GameDto;
    /** Set when the game is in their collection */
    entry: PublicEntryDto | null;
    /** On their wishlist */
    wishlisted: boolean;
}
