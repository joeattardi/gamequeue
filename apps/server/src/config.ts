export interface Config {
    port: number;
    databasePath: string;
    signupsEnabled: boolean;
    allowedOrigins: string[];
    /** Public address of the site, no trailing slash; share cards and link previews need absolute URLs */
    publicUrl: string;
    secureCookies: boolean;
    trustProxy: boolean;
    igdbClientId?: string;
    igdbClientSecret?: string;
    /** IsThereAnyDeal API key; wishlist prices are off without it */
    itadApiKey?: string;
    /** Two-letter country whose shops and currency ITAD prices use */
    itadCountry: string;
    /** Cloudflare API token (Analytics: Read) and the site's zone id; the admin Traffic page is off without both */
    cloudflareApiToken?: string;
    cloudflareZoneId?: string;
    /** Link to the full analytics page in the Cloudflare dashboard, shown on the admin Traffic page */
    cloudflareAnalyticsUrl?: string;
    /** Email of the founder's account; that profile gets the "founder" badge (never exposed) */
    founderEmail?: string;
    resendApiKey?: string;
    notifyEmail?: string;
    notifyFrom: string;
    /** Git commit of the build, from the GIT_COMMIT build arg; shown on the admin Server page */
    version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return {
        port: Number(env.PORT ?? 3000),
        databasePath: env.DATABASE_PATH ?? './data/gamequeue.db',
        // Default OFF if unset would lock the owner out of first signup; default on, documented in .env.example
        signupsEnabled: (env.SIGNUPS_ENABLED ?? 'true').toLowerCase() === 'true',
        allowedOrigins,
        // In production ALLOWED_ORIGINS is already the real URL, so that is the default
        publicUrl: (env.PUBLIC_URL || allowedOrigins[0] || 'http://localhost:3000').replace(
            /\/+$/,
            ''
        ),
        secureCookies: env.NODE_ENV === 'production',
        // Only enable behind a reverse proxy you control (Caddy); otherwise X-Forwarded-For is spoofable
        trustProxy: (env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
        igdbClientId: env.IGDB_CLIENT_ID || undefined,
        igdbClientSecret: env.IGDB_CLIENT_SECRET || undefined,
        itadApiKey: env.ITAD_API_KEY || undefined,
        itadCountry: (env.ITAD_COUNTRY || 'US').toUpperCase(),
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN || undefined,
        cloudflareZoneId: env.CLOUDFLARE_ZONE_ID || undefined,
        cloudflareAnalyticsUrl: env.CLOUDFLARE_ANALYTICS_URL || undefined,
        founderEmail: env.FOUNDER_EMAIL?.trim().toLowerCase() || undefined,
        // Owner alerts (new signups) by email through Resend; off unless both key and address are set
        resendApiKey: env.RESEND_API_KEY || undefined,
        notifyEmail: env.NOTIFY_EMAIL || undefined,
        // Resend's shared sender only delivers to the address on your Resend account
        notifyFrom: env.NOTIFY_FROM || 'GameQueue <onboarding@resend.dev>',
        version: env.GIT_COMMIT || 'unknown'
    };
}
