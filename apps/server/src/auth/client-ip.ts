import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

/**
 * IPv6 clients can pick any address inside their /64 (privacy addresses rotate within it), so the
 * first four groups stand for the whole network. IPv4 is returned as is.
 */
export function normalizeIp(raw: string): string {
    const ip = raw.split('%')[0]!.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return mapped[1]!;
    if (!ip.includes(':')) return ip;
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups =
        tail === undefined
            ? h
            : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
    if (groups.length < 4) return ip;
    return `${groups
        .slice(0, 4)
        .map((g) => g.replace(/^0+(?=.)/, ''))
        .join(':')}::/64`;
}

/**
 * The address to rate-limit on. Behind the Cloudflare Tunnel (`TRUST_PROXY=true`) that is
 * `CF-Connecting-IP`, which Cloudflare always sets to the true client address, so a client can't pick
 * its own key; `X-Forwarded-For` is the fallback for other proxies. Only safe while the app is
 * reachable solely through the proxy (DEPLOYMENT.md): otherwise these headers are spoofable.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
    if (trustProxy) {
        const header =
            c.req.header('cf-connecting-ip')?.trim() ||
            c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
        if (header) return normalizeIp(header);
    }
    try {
        return normalizeIp(getConnInfo(c).remote.address ?? 'unknown');
    } catch {
        return 'unknown'; // app.request() in tests has no socket
    }
}
