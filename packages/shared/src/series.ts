import type { EntryStatus } from './collection.js';
import type { ReleasePrecision } from './release.js';

/** An IGDB series ("collection" in IGDB's words), as a game links to it */
export interface SeriesRefDto {
    id: number;
    name: string;
}

/**
 * Game types worth listing as a series' entries (IGDB ids: Main Game 0, Standalone Expansion 4,
 * Remake 8, Remaster 9). Editions, ports, DLC and the like are left out of the lookup; a game the
 * user owns or wishlists is shown whatever its type.
 */
export const SERIES_GAME_TYPES = [0, 4, 8, 9] as const;

export interface SeriesMemberDto {
    igdbId: number;
    name: string;
    coverImageId: string | null;
    releaseDate: string | null;
    releasePrecision: ReleasePrecision | null;
    /** Set when the game is in the user's collection */
    entry: { id: number; status: EntryStatus; queued: boolean } | null;
    wishlisted: boolean;
}

export interface SeriesDto {
    id: number;
    name: string;
    /** In release order, games with no date last */
    members: SeriesMemberDto[];
}

export interface QueueSeriesResultDto {
    /** How many games were added to the queue */
    added: number;
}
