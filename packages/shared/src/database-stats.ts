/** What the admin Database page shows: file size, the shared IGDB cache, and what users have stored. */
export interface DatabaseStatsDto {
    sqliteVersion: string;
    storage: {
        /** Size of the main database file on disk (0 for an in-memory database) */
        fileBytes: number;
        /** Size of the write-ahead log next to it, which SQLite folds back in on checkpoints */
        walBytes: number;
        pageSize: number;
        pageCount: number;
        /** Pages inside the file that hold nothing; reusable, and returned to the OS only by VACUUM */
        freePages: number;
    };
    /** Metadata copied from IGDB, shared by all users */
    cache: {
        games: number;
        /** Games that some collection entry or wishlist item points at */
        gamesInUse: number;
        series: number;
        /** Series that none of the cached games belongs to */
        unusedSeries: number;
        /** Series member rows (the games IGDB lists per series; not necessarily cached games) */
        seriesMembers: number;
        platforms: number;
        genres: number;
        themes: number;
        /** When the least and most recently fetched game record was fetched (ms); null if empty */
        oldestFetchedAt: number | null;
        newestFetchedAt: number | null;
    };
    content: {
        users: number;
        entries: number;
        playthroughs: number;
        lists: number;
        smartLists: number;
        wishlistItems: number;
        tags: number;
        avatars: number;
        avatarBytes: number;
        sessions: number;
        expiredSessions: number;
    };
    /** Every table with its row count and the bytes of its pages including indexes, largest first */
    tables: { name: string; rows: number; bytes: number }[];
}
