import { describe, expect, it } from 'vitest';
import { TRAFFIC_DAYS } from '@gamequeue/shared';
import { createSession } from '../src/auth/sessions.js';
import { createCloudflareClient } from '../src/cloudflare/client.js';
import {
    CloudflareError,
    type CloudflareClient,
    type CloudflareDay
} from '../src/cloudflare/types.js';
import { users } from '../src/db/schema.js';
import { getTraffic, trafficCache } from '../src/services/traffic.js';
import { cookieFrom, makeApp, register } from './helpers.js';

const NOW = Date.parse('2026-10-24T15:00:00Z');
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const row = (
    offset: number,
    requests: number,
    extra: Partial<CloudflareDay> = {}
): CloudflareDay => ({
    day: day(offset),
    requests,
    cachedRequests: Math.floor(requests / 2),
    pageViews: Math.floor(requests / 4),
    uniques: 3,
    bytes: requests * 1000,
    ...extra
});

function fakeCloudflare(rows: CloudflareDay[] = []) {
    const calls: string[] = [];
    const client: CloudflareClient = {
        async dailyTraffic(since) {
            calls.push(since);
            return rows;
        }
    };
    return { client, calls };
}

describe('getTraffic', () => {
    it('is simply off without a Cloudflare client', async () => {
        expect(await getTraffic(undefined, trafficCache(), NOW)).toEqual({
            enabled: false,
            days: [],
            fetchedAt: null
        });
    });

    it('returns the last 30 UTC days oldest first, filling gaps with zeros', async () => {
        const { client, calls } = fakeCloudflare([row(-29, 100), row(-3, 40), row(0, 10)]);
        const t = await getTraffic(client, trafficCache(), NOW);
        expect(calls).toEqual([day(-29)]);
        expect(t.enabled).toBe(true);
        expect(t.fetchedAt).toBe(NOW);
        expect(t.days).toHaveLength(TRAFFIC_DAYS);
        expect(t.days[0]!.day).toBe(day(-29));
        expect(t.days.at(-1)!.day).toBe(day(0));
        expect(t.days[0]).toEqual({
            day: day(-29),
            requests: 100,
            cached: 50,
            uncached: 50,
            pageViews: 25,
            uniques: 3,
            bytes: 100_000
        });
        const quiet = t.days.find((d) => d.day === day(-10))!;
        expect(quiet).toMatchObject({ requests: 0, cached: 0, uncached: 0, uniques: 0, bytes: 0 });
    });

    it('never reports more cached than total requests', async () => {
        const { client } = fakeCloudflare([row(0, 10, { cachedRequests: 25 })]);
        const t = await getTraffic(client, trafficCache(), NOW);
        expect(t.days.at(-1)).toMatchObject({ requests: 10, cached: 10, uncached: 0 });
    });

    it('asks Cloudflare once per few minutes, not on every view', async () => {
        const { client, calls } = fakeCloudflare([row(0, 5)]);
        const cache = trafficCache();
        const first = await getTraffic(client, cache, NOW);
        const second = await getTraffic(client, cache, NOW + 1000);
        expect(second).toBe(first);
        expect(calls).toHaveLength(1);
    });

    it('turns a Cloudflare failure into a 502 with its message, and does not cache it', async () => {
        let fail = true;
        const client: CloudflareClient = {
            async dailyTraffic() {
                if (fail) throw new CloudflareError('Cloudflare answered 500', 500);
                return [];
            }
        };
        const cache = trafficCache();
        await expect(getTraffic(client, cache, NOW)).rejects.toMatchObject({
            status: 502,
            message: 'Cloudflare answered 500'
        });
        fail = false;
        expect((await getTraffic(client, cache, NOW)).enabled).toBe(true);
    });
});

describe('Cloudflare client', () => {
    const graphql = (body: unknown, status = 200) =>
        (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
    const make = (fetchFn: typeof fetch) =>
        createCloudflareClient({ apiToken: 'tok', zoneId: 'zone1', fetchFn });
    const group = {
        dimensions: { date: '2026-10-24' },
        sum: { requests: 9, cachedRequests: 4, bytes: 1234, pageViews: 3 },
        uniq: { uniques: 2 }
    };

    it('sends the token in a header, never the URL, and the zone and start day as variables', async () => {
        let seen: { url: string; init: RequestInit } | undefined;
        const fetchFn = (async (url: string, init: RequestInit) => {
            seen = { url, init };
            return new Response(
                JSON.stringify({ data: { viewer: { zones: [{ httpRequests1dGroups: [group] }] } } })
            );
        }) as unknown as typeof fetch;
        const days = await make(fetchFn).dailyTraffic('2026-09-25');
        expect(days).toEqual([
            {
                day: '2026-10-24',
                requests: 9,
                cachedRequests: 4,
                pageViews: 3,
                uniques: 2,
                bytes: 1234
            }
        ]);
        expect(seen!.url).toBe('https://api.cloudflare.com/client/v4/graphql');
        expect(seen!.url).not.toContain('tok');
        expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
        expect(JSON.parse(seen!.init.body as string).variables).toEqual({
            zoneTag: 'zone1',
            since: '2026-09-25'
        });
    });

    it('explains the common failures', async () => {
        const msg = (f: typeof fetch) =>
            make(f)
                .dailyTraffic('2026-09-25')
                .catch((e: Error) => e.message);
        expect(await msg(graphql({}, 403))).toMatch(/rejected the API token/);
        expect(await msg(graphql({}, 500))).toMatch(/answered 500/);
        expect(await msg(graphql({ data: null, errors: [{ message: 'not authorized' }] }))).toBe(
            'Cloudflare: not authorized'
        );
        expect(await msg(graphql({ data: { viewer: { zones: [] } } }))).toMatch(/no such zone/);
        expect(
            await msg((async () => {
                throw new Error('offline');
            }) as unknown as typeof fetch)
        ).toMatch(/request failed: offline/);
    });

    it('treats a zone with no traffic groups as no days', async () => {
        const f = graphql({ data: { viewer: { zones: [{ httpRequests1dGroups: [] }] } } });
        expect(await make(f).dailyTraffic('2026-09-25')).toEqual([]);
    });
});

describe('GET /api/admin/traffic', () => {
    function setup(cloudflare?: CloudflareClient) {
        const { app, db } = makeApp({}, undefined, undefined, cloudflare);
        const root = db
            .insert(users)
            .values({
                username: 'root',
                email: 'root@example.com',
                passwordHash: 'x',
                role: 'admin'
            })
            .returning({ id: users.id })
            .get();
        const admin = `gq_session=${createSession(db, root.id).token}`;
        return { app, admin };
    }

    it('says it is not set up without a token and zone', async () => {
        const { app, admin } = setup();
        const res = await app.request('/api/admin/traffic', { headers: { cookie: admin } });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ enabled: false, days: [], fetchedAt: null });
    });

    it('serves the daily traffic and a clear 502 when Cloudflare is down', async () => {
        const { client } = fakeCloudflare([row(0, 7)]);
        const ok = setup(client);
        const res = await ok.app.request('/api/admin/traffic', { headers: { cookie: ok.admin } });
        const body = (await res.json()) as { enabled: boolean; days: { requests: number }[] };
        expect(body.enabled).toBe(true);
        expect(body.days).toHaveLength(TRAFFIC_DAYS);
        expect(body.days.at(-1)!.requests).toBe(7);

        const broken = setup({
            async dailyTraffic() {
                throw new CloudflareError('Cloudflare answered 500', 500);
            }
        });
        const bad = await broken.app.request('/api/admin/traffic', {
            headers: { cookie: broken.admin }
        });
        expect(bad.status).toBe(502);
        expect(((await bad.json()) as { error: string }).error).toBe('Cloudflare answered 500');
    });

    it('is for admins only', async () => {
        const { client } = fakeCloudflare();
        const { app } = setup(client);
        expect((await app.request('/api/admin/traffic')).status).toBe(401);
        const user = cookieFrom(await register(app, 'plain@example.com'));
        expect(
            (await app.request('/api/admin/traffic', { headers: { cookie: user } })).status
        ).toBe(403);
    });
});
