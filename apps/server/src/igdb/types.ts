import type {
    IgdbPingDto,
    MirrorLookupMethod,
    IgdbStatusDto,
    PlatformDto,
    ReleasePrecision,
    SeriesRefDto,
    ShowcaseGameDto
} from '@gamequeue/shared';

/** A game as we cache it (shared across users) */
export interface GameRecord {
    id: number;
    name: string;
    slug: string | null;
    summary: string | null;
    releaseDate: string | null; // YYYY-MM-DD (UTC)
    releasePrecision: ReleasePrecision | null;
    series: SeriesRefDto[];
    /** IGDB image ids of the first few screenshots */
    screenshots: string[];
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

/** An IGDB series with the games worth listing in it (see `SERIES_GAME_TYPES`) */
export interface SeriesRecord {
    id: number;
    name: string;
    games: {
        id: number;
        name: string;
        coverImageId: string | null;
        releaseDate: string | null;
        releasePrecision: ReleasePrecision | null;
    }[];
}

/**
 * A local copy of IGDB that can be read without a request (the mirror), for work that touches many
 * games at once. Only what is in the copy: nothing here falls back to the live API.
 */
export interface LocalIgdb {
    /** Which data dump the copy was built from; changes whenever it is rebuilt */
    dump(): string | null;
    game(igdbId: number): GameRecord | null;
    seriesRecord(seriesId: number): SeriesRecord | null;
    platforms(): PlatformDto[];
    /** Random well-known games with a cover, for the public landing page */
    showcase(count: number): ShowcaseGameDto[];
}

/** How a client answered its lookups, per kind: from the local copy or by asking live IGDB. */
export interface LookupStats {
    since: number;
    counts: Record<MirrorLookupMethod, { local: number; live: number }>;
}

/** Everything the app needs from IGDB. Faked in tests. */
export interface IgdbClient {
    search(query: string): Promise<IgdbSearchHit[]>;
    fetchGame(igdbId: number): Promise<GameRecord | null>;
    /** Many games at once (an import); ids IGDB doesn't know are left out */
    fetchGames(igdbIds: number[]): Promise<GameRecord[]>;
    fetchPlatforms(): Promise<PlatformDto[]>;
    /** Current release dates for these games; ids IGDB no longer knows are left out */
    fetchReleaseDates(igdbIds: number[]): Promise<ReleaseInfo[]>;
    /** Which series each game belongs to; ids IGDB no longer knows are left out */
    fetchGameSeries(igdbIds: number[]): Promise<{ id: number; series: SeriesRefDto[] }[]>;
    /** Screenshot image ids for one game, or null when IGDB no longer knows it */
    fetchScreenshots(igdbId: number): Promise<string[] | null>;
    fetchSeries(seriesId: number): Promise<SeriesRecord | null>;
    /** IGDB's `similar_games` for one game (add-ons and editions left out); empty when it lists none */
    fetchSimilarGames(igdbId: number): Promise<IgdbSearchHit[]>;
    /** The local copy behind this client, if it has one and one is built right now */
    local?(): LocalIgdb | null;
    /** Lookup counters since the server started; only the mirror client keeps them */
    lookups?(): LookupStats;
    /** Counters for the admin page; the real client keeps them, test fakes needn't */
    status?(): Omit<IgdbStatusDto, 'configured' | 'lastReleaseCheckAt' | 'history'>;
    /** One cheap request to prove credentials and connectivity work */
    ping?(): Promise<IgdbPingDto>;
}

export class IgdbError extends Error {
    constructor(
        message: string,
        public status?: number
    ) {
        super(message);
    }
}
