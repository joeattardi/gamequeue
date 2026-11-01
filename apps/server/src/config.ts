import { dirname, join } from 'node:path';

export interface Config {
    port: number;
    databasePath: string;
    /** The IGDB mirror file, rebuilt from IGDB's data dumps by `npm run igdb:mirror` (see IGDB_MIRROR.md) */
    igdbMirrorPath: string;
    /** Folder for journal screenshots (re-encoded WebP files named by content hash) */
    screenshotsPath: string;
    signupsEnabled: boolean;
    allowedOrigins: string[];
    /** Public address of the site, no trailing slash; share cards and link previews need absolute URLs */
    publicUrl: string;
    secureCookies: boolean;
    /** `NODE_ENV=production`: no development shortcuts such as reset links on the console */
    production: boolean;
    trustProxy: boolean;
    igdbClientId?: string;
    igdbClientSecret?: string;
    /** Cloudflare API token (Analytics: Read) and the site's zone id; the admin Traffic page is off without both */
    cloudflareApiToken?: string;
    cloudflareZoneId?: string;
    /** Link to the full analytics page in the Cloudflare dashboard, shown on the admin Traffic page */
    cloudflareAnalyticsUrl?: string;
    /** User id of the founder's account; that profile gets the "founder" badge */
    founderUserId?: number;
    resendApiKey?: string;
    /** Anthropic API key for the AI features; they are off (and hidden) without it. Never sent to the browser or logged. */
    anthropicApiKey?: string;
    /** Model the AI features use */
    aiModel: string;
    notifyEmail?: string;
    notifyFrom: string;
    /** Sender of the verification emails (a domain verified in Resend); verification is off without it */
    mailFrom?: string;
    /** Most emails sent to users per UTC day; stops a flood of signups using up the Resend quota */
    mailDailyLimit: number;
    /** New accounts must confirm their email before they can use the app (needs `resendApiKey` and `mailFrom`) */
    emailVerification: boolean;
    /** Git commit of the build, from the GIT_COMMIT build arg; shown on the admin Server page */
    version: string;
}

/** A positive whole number from the environment, or undefined when unset or malformed. */
function positiveInt(value: string | undefined): number | undefined {
    const n = Number(value?.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return {
        port: Number(env.PORT ?? 3000),
        databasePath: env.DATABASE_PATH ?? './data/gamequeue.db',
        igdbMirrorPath: env.IGDB_MIRROR_PATH ?? './data/igdb.db',
        screenshotsPath:
            env.SCREENSHOTS_PATH ??
            join(dirname(env.DATABASE_PATH ?? './data/gamequeue.db'), 'screenshots'),
        // Default OFF if unset would lock the owner out of first signup; default on, documented in .env.example
        signupsEnabled: (env.SIGNUPS_ENABLED ?? 'true').toLowerCase() === 'true',
        allowedOrigins,
        // In production ALLOWED_ORIGINS is already the real URL, so that is the default
        publicUrl: (env.PUBLIC_URL || allowedOrigins[0] || 'http://localhost:3000').replace(
            /\/+$/,
            ''
        ),
        secureCookies: env.NODE_ENV === 'production',
        production: env.NODE_ENV === 'production',
        // Only enable behind a reverse proxy you control (Caddy); otherwise X-Forwarded-For is spoofable
        trustProxy: (env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
        igdbClientId: env.IGDB_CLIENT_ID || undefined,
        igdbClientSecret: env.IGDB_CLIENT_SECRET || undefined,
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN || undefined,
        cloudflareZoneId: env.CLOUDFLARE_ZONE_ID || undefined,
        cloudflareAnalyticsUrl: env.CLOUDFLARE_ANALYTICS_URL || undefined,
        founderUserId: positiveInt(env.FOUNDER_USER_ID),
        // Owner alerts (new signups) by email through Resend; off unless both key and address are set
        resendApiKey: env.RESEND_API_KEY || undefined,
        anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
        aiModel: env.AI_MODEL?.trim() || 'claude-sonnet-5-5',
        notifyEmail: env.NOTIFY_EMAIL || undefined,
        // Resend's shared sender only delivers to the address on your Resend account
        notifyFrom: env.NOTIFY_FROM || 'GameQueue <onboarding@resend.dev>',
        mailFrom: env.MAIL_FROM || undefined,
        // Resend's free plan allows 100 a day; the margin leaves room for the owner alerts
        mailDailyLimit: positiveInt(env.MAIL_DAILY_LIMIT) ?? 80,
        // Explicit sender required: with Resend's shared one, mail only reaches the account owner
        emailVerification: Boolean(env.RESEND_API_KEY && env.MAIL_FROM),
        version: env.GIT_COMMIT || 'unknown'
    };
}
