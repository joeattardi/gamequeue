import { describe, expect, it, vi } from 'vitest';
import { normalizeIp } from '../src/auth/client-ip.js';
import { HitLimiter } from '../src/auth/rate-limit.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { json } from './helpers.js';

function setup(overrides: Record<string, number>, trustProxy = true, clock = () => 0) {
    const config = { ...loadConfig({}), trustProxy };
    return createApp({
        db: openDb(':memory:'),
        config,
        requestLimits: { overrides, clock }
    });
}

const from = (ip: string) => ({ 'cf-connecting-ip': ip });

describe('HitLimiter', () => {
    it('allows max hits per window, then reports the wait, then resets', () => {
        let now = 0;
        const l = new HitLimiter(2, 10_000, () => now);
        expect(l.hit('a').retryAfter).toBe(0);
        expect(l.hit('a').retryAfter).toBe(0);
        now = 4000;
        expect(l.hit('a').retryAfter).toBe(6);
        expect(l.hit('b').retryAfter).toBe(0);
        now = 10_000;
        expect(l.hit('a').retryAfter).toBe(0);
    });
});

describe('normalizeIp', () => {
    it('keeps IPv4 and collapses IPv6 to its /64', () => {
        expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
        expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
        expect(normalizeIp('2601:18c:cc00:dee0:daa:15d0:b638:b0ad')).toBe(
            '2601:18c:cc00:dee0::/64'
        );
        expect(normalizeIp('2601:18C:cc00:dee0:4cc9:1f94:e3ac:fe5f')).toBe(
            '2601:18c:cc00:dee0::/64'
        );
        expect(normalizeIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
        expect(normalizeIp('::1')).toBe('0:0:0:0::/64');
    });
});

describe('request limits', () => {
    it('returns 429 with Retry-After past the general limit, per client address', async () => {
        const app = setup({ general: 3 });
        for (let i = 0; i < 3; i++)
            expect(
                (await app.request('/api/me-nope', { headers: from('203.0.113.1') })).status
            ).toBe(404);
        const res = await app.request('/api/me-nope', { headers: from('203.0.113.1') });
        expect(res.status).toBe(429);
        expect(res.headers.get('retry-after')).toBe('60');
        expect((await res.json()).error).toMatch(/too many requests/i);
        // another client is unaffected
        expect((await app.request('/api/me-nope', { headers: from('203.0.113.2') })).status).toBe(
            404
        );
    });

    it('treats addresses in one IPv6 /64 as one client', async () => {
        const app = setup({ general: 1 });
        await app.request('/api/x', { headers: from('2601:18c:cc00:dee0::1') });
        const res = await app.request('/api/x', { headers: from('2601:18c:cc00:dee0:aaaa::2') });
        expect(res.status).toBe(429);
    });

    it('ignores a spoofed X-Forwarded-For when CF-Connecting-IP is present', async () => {
        const app = setup({ general: 1 });
        await app.request('/api/x', {
            headers: { ...from('203.0.113.1'), 'x-forwarded-for': '198.51.100.1' }
        });
        const res = await app.request('/api/x', {
            headers: { ...from('203.0.113.1'), 'x-forwarded-for': '198.51.100.2' }
        });
        expect(res.status).toBe(429);
    });

    it('limits registration separately, and leaves other routes alone', async () => {
        const app = setup({ signup: 1 });
        const register = (n: number) =>
            app.request(
                '/api/auth/register',
                json(
                    {
                        username: `user_${n}`,
                        email: `u${n}@example.com`,
                        password: 'correct horse battery'
                    },
                    from('203.0.113.1')
                )
            );
        expect((await register(1)).status).toBe(201);
        expect((await register(2)).status).toBe(429);
        expect((await app.request('/api/health', { headers: from('203.0.113.1') })).status).toBe(
            200
        );
    });

    it('never limits the health check', async () => {
        const app = setup({ general: 1 });
        for (let i = 0; i < 5; i++)
            expect(
                (await app.request('/api/health', { headers: from('203.0.113.1') })).status
            ).toBe(200);
    });

    it('limits share cards and IGDB routes on their own tier, on top of the general one', async () => {
        const app = setup({ 'share-card': 1, igdb: 1 });
        const get = (p: string) => app.request(p, { headers: from('203.0.113.1') });
        await get('/api/og/profile/nobody.png');
        expect((await get('/api/og/profile/nobody.png')).status).toBe(429);
        await get('/api/igdb/platforms');
        expect((await get('/api/igdb/platforms')).status).toBe(429);
    });

    it('logs once per client and window when a limit trips', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const app = setup({ general: 1 });
        for (let i = 0; i < 4; i++) await app.request('/api/x', { headers: from('203.0.113.1') });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('tier=general ip=203.0.113.1');
        warn.mockRestore();
    });

    it('starts a new window after the wait', async () => {
        let now = 0;
        const app = setup({ general: 1 }, true, () => now);
        await app.request('/api/x', { headers: from('203.0.113.1') });
        expect((await app.request('/api/x', { headers: from('203.0.113.1') })).status).toBe(429);
        now = 60_000;
        expect((await app.request('/api/x', { headers: from('203.0.113.1') })).status).toBe(404);
    });
});
