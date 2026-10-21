import type { PlatformDto, ReleasePrecision } from '@gamequeue/shared';

/** A game as we cache it (shared across users) */
export interface GameRecord {
    id: number;
    name: string;
    slug: string | null;
    summary: string | null;
    releaseDate: string | null; // YYYY-MM-DD (UTC)
    releasePrecision: ReleasePrecision | null;
    coverImageId: string | null;
    igdbRating: number | null; // 0-100
    igdbRatingCount: number | null;
    gameType: string | null;
    platforms: PlatformDto[];
    genres: { id: number; name: string }[];
    themes: { id: number; name: string }[];
    ttb: {
        hastilySeconds: number | null;
        normallySeconds: number | null;
        completelySeconds: number | null;
        count: number;
    } | null;
}

export interface IgdbSearchHit {
    id: number;
    name: string;
    year: number | null;
    coverImageId: string | null;
    /** IGDB's aggregated rating, 0-100 */
    rating: number | null;
    platforms: PlatformDto[];
}

export interface ReleaseInfo {
    id: number;
    releaseDate: string | null;
    releasePrecision: ReleasePrecision | null;
}

/** Everything the app needs from IGDB. Faked in tests. */
export interface IgdbClient {
    search(query: string): Promise<IgdbSearchHit[]>;
    fetchGame(igdbId: number): Promise<GameRecord | null>;
    fetchPlatforms(): Promise<PlatformDto[]>;
    /** Current release dates for these games; ids IGDB no longer knows are left out */
    fetchReleaseDates(igdbIds: number[]): Promise<ReleaseInfo[]>;
}

export class IgdbError extends Error {
    constructor(
        message: string,
        public status?: number
    ) {
        super(message);
    }
}
