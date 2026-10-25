import type { MiddlewareHandler } from 'hono';
import { clientIp } from './client-ip.js';
import { HitLimiter } from './rate-limit.js';

interface Tier {
    name: string;
    max: number;
    windowMs: number;
    /** Tiers other than `general` are counted in addition to it */
    match: (method: string, path: string) => boolean;
}

const MINUTE = 60_000;

/**
 * Per-IP request limits for the whole API. A request counts toward `general` and toward the first
 * tier that matches it. The general number is deliberately high: one page load fans out into many
 * requests, and several people can share an address.
 */
export const GENERAL_TIER: Tier = {
    name: 'general',
    max: 300,
    windowMs: MINUTE,
    match: (_m, path) => path !== '/api/health'
};

export const SPECIFIC_TIERS: Tier[] = [
    {
        name: 'signup',
        max: 10,
        windowMs: 60 * MINUTE,
        match: (m, p) => m === 'POST' && p === '/api/auth/register'
    },
    // Each one can send an email or burn a token guess
    {
        name: 'verify-email',
        max: 20,
        windowMs: 60 * MINUTE,
        match: (m, p) =>
            m !== 'GET' &&
            (p === '/api/auth/verify-email' ||
                p === '/api/auth/resend-verification' ||
                p === '/api/auth/email' ||
                p === '/api/auth/forgot-password' ||
                p === '/api/auth/reset-password')
    },
    // Import (a merge inside a transaction) and the full exports
    { name: 'data', max: 20, windowMs: 10 * MINUTE, match: (_m, p) => p.startsWith('/api/data/') },
    // Cache misses render a PNG; crawlers fetch these in bursts
    { name: 'share-card', max: 60, windowMs: MINUTE, match: (_m, p) => p.startsWith('/api/og/') },
    // Everything that can reach IGDB; it has its own outbound queue, this stops one client filling it
    {
        name: 'igdb',
        max: 60,
        windowMs: MINUTE,
        match: (_m, p) => p.startsWith('/api/igdb/') || p === '/api/discover'
    }
];

/** Overrides for tests: tier name → max requests per window */
export type RequestLimitOverrides = Partial<Record<string, number>>;

export function requestLimits(
    trustProxy: boolean,
    opts: { overrides?: RequestLimitOverrides; clock?: () => number } = {}
): MiddlewareHandler {
    const tiers = [GENERAL_TIER, ...SPECIFIC_TIERS].map((tier) => ({
        tier,
        limiter: new HitLimiter(opts.overrides?.[tier.name] ?? tier.max, tier.windowMs, opts.clock)
    }));
    return async (c, next) => {
        const method = c.req.method;
        const path = c.req.path;
        const ip = clientIp(c, trustProxy);
        let wait = 0;
        let specificDone = false;
        for (const { tier, limiter } of tiers) {
            const isSpecific = tier !== GENERAL_TIER;
            if (isSpecific && specificDone) continue;
            if (!tier.match(method, path)) continue;
            if (isSpecific) specificDone = true;
            const { retryAfter, count } = limiter.hit(ip);
            wait = Math.max(wait, retryAfter);
            // One line per client and window, not one per rejected request
            if (count === limiter.max + 1)
                console.warn(`Rate limited: tier=${tier.name} ip=${ip} ${method} ${path}`);
        }
        if (wait > 0) {
            c.header('Retry-After', String(wait));
            return c.json({ error: `Too many requests. Try again in ${wait} seconds.` }, 429);
        }
        await next();
    };
}
