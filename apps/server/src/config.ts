export interface Config {
    port: number;
    databasePath: string;
    signupsEnabled: boolean;
    allowedOrigins: string[];
    secureCookies: boolean;
    trustProxy: boolean;
    igdbClientId?: string;
    igdbClientSecret?: string;
    resendApiKey?: string;
    notifyEmail?: string;
    notifyFrom: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return {
        port: Number(env.PORT ?? 3000),
        databasePath: env.DATABASE_PATH ?? './data/gamequeue.db',
        // Default OFF if unset would lock the owner out of first signup; default on, documented in .env.example
        signupsEnabled: (env.SIGNUPS_ENABLED ?? 'true').toLowerCase() === 'true',
        allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        secureCookies: env.NODE_ENV === 'production',
        // Only enable behind a reverse proxy you control (Caddy); otherwise X-Forwarded-For is spoofable
        trustProxy: (env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
        igdbClientId: env.IGDB_CLIENT_ID || undefined,
        igdbClientSecret: env.IGDB_CLIENT_SECRET || undefined,
        // Owner alerts (new signups) by email through Resend; off unless both key and address are set
        resendApiKey: env.RESEND_API_KEY || undefined,
        notifyEmail: env.NOTIFY_EMAIL || undefined,
        // Resend's shared sender only delivers to the address on your Resend account
        notifyFrom: env.NOTIFY_FROM || 'GameQueue <onboarding@resend.dev>'
    };
}
