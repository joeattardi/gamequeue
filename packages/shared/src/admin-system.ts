import { z } from 'zod';

/** In-memory IGDB client counters (reset when the server restarts). */
export interface IgdbStatusDto {
    /** False when IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not set */
    configured: boolean;
    /** False for a client that does not keep counters (never the real one) */
    tracked: boolean;
    /** When the server started counting (ms) */
    since: number;
    token: {
        /** There is a cached Twitch token that has not expired */
        valid: boolean;
        expiresAt: number | null;
    };
    /** Requests in the last 24 hours (retries count separately) */
    requests24h: { total: number; failed: number };
    lastSuccessAt: number | null;
    lastError: { at: number; message: string; status: number | null } | null;
    /** Most recent time the app asked IGDB for a game's release date (from the cache table) */
    lastReleaseCheckAt: number | null;
}

export interface IgdbPingDto {
    ok: boolean;
    /** Round trip including a token refresh if one was needed */
    ms: number;
    error: string | null;
}

export interface ServerInfoDto {
    nodeVersion: string;
    platform: string;
    arch: string;
    nodeEnv: string;
    startedAt: number;
    uptimeSeconds: number;
    memory: { rssBytes: number; heapUsedBytes: number };
    config: {
        port: number;
        databasePath: string;
        secureCookies: boolean;
        trustProxy: boolean;
        allowedOrigins: string[];
        /** Credentials are never sent, only whether they are set */
        igdbConfigured: boolean;
    };
    /** The volume holding the database; null if the platform can't report it */
    disk: { totalBytes: number; freeBytes: number } | null;
}

export interface AdminSettingsDto {
    signupsEnabled: boolean;
    /** What the SIGNUPS_ENABLED environment variable says; used until an admin changes the setting */
    signupsDefault: boolean;
    /** True once an admin has saved the setting, so the environment value no longer applies */
    signupsOverridden: boolean;
}

export const adminSettingsSchema = z.object({ signupsEnabled: z.boolean() });
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

export interface PurgeUnusedGamesResult {
    deletedGames: number;
    deletedSeries: number;
}
export interface PurgeSessionsResult {
    deleted: number;
}
export interface VacuumResult {
    /** Database file plus write-ahead log, before and after */
    beforeBytes: number;
    afterBytes: number;
}
