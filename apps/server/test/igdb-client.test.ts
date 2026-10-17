import { describe, expect, it } from 'vitest';
import { createIgdbClient, quote } from '../src/igdb/client.js';
import { RequestLimiter } from '../src/igdb/limiter.js';
import { TokenProvider } from '../src/igdb/token.js';
import { IgdbError } from '../src/igdb/types.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers }
    });

describe('TokenProvider', () => {
    const make = (now: () => number, expiresIn = 5_000_000) => {
        let n = 0;
        const calls: string[] = [];
        const fetchFn = (async (url: string) => {
            calls.push(url);
            return json({ access_token: `tok${++n}`, expires_in: expiresIn, token_type: 'bearer' });
        }) as unknown as typeof fetch;
        return { provider: new TokenProvider('id', 'secret', fetchFn, now), calls };
    };

    it('caches the token and shares one in-flight refresh', async () => {
        const { provider, calls } = make(() => 0);
        const [a, b] = await Promise.all([provider.get(), provider.get()]);
        expect(a).toBe('tok1');
        expect(b).toBe('tok1');
        expect(await provider.get()).toBe('tok1');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('grant_type=client_credentials');
        expect(calls[0]).toContain('client_id=id');
    });

    it('refreshes before expiry and after invalidate', async () => {
        let t = 0;
        const { provider, calls } = make(() => t, 10_000); // 10,000 s lifetime
        await provider.get();
        t = (10_000 - 3600 - 1) * 1000; // just outside the 1 h margin
        expect(await provider.get()).toBe('tok1');
        t = (10_000 - 3600 + 1) * 1000; // inside the margin
        expect(await provider.get()).toBe('tok2');
        provider.invalidate();
        expect(await provider.get()).toBe('tok3');
        expect(calls).toHaveLength(3);
    });

    it('throws when Twitch rejects the credentials', async () => {
        const fetchFn = (async () =>
            new Response('{}', { status: 400 })) as unknown as typeof fetch;
        await expect(new TokenProvider('id', 'bad', fetchFn).get()).rejects.toThrow(/Twitch token/);
    });
});

describe('IGDB client', () => {
    function setup(handler: (endpoint: string, init: RequestInit, n: number) => Response) {
        const requests: { url: string; headers: Record<string, string>; body: string }[] = [];
        let tokenN = 0;
        const fetchFn = (async (url: string, init: RequestInit = {}) => {
            if (url.startsWith('https://id.twitch.tv'))
                return json({ access_token: `tok${++tokenN}`, expires_in: 5_000_000 });
            requests.push({
                url,
                headers: init.headers as Record<string, string>,
                body: String(init.body)
            });
            return handler(url.replace('https://api.igdb.com/v4/', ''), init, requests.length);
        }) as unknown as typeof fetch;
        const client = createIgdbClient({
            clientId: 'cid',
            clientSecret: 'sec',
            fetchFn,
            limiter: new RequestLimiter(1000, 8),
            sleep: async () => {}
        });
        return { client, requests };
    }

    it('quotes APICalypse strings safely', () => {
        expect(quote('a "b" \\c')).toBe('"a \\"b\\" \\\\c"');
    });

    it('searches, excludes editions via the query and DLC by type, and maps hits', async () => {
        const { client, requests } = setup(() =>
            json([
                {
                    id: 1,
                    name: 'Hades',
                    first_release_date: 1600000000,
                    cover: { image_id: 'abc' },
                    platforms: [{ id: 6, name: 'PC', abbreviation: 'PC' }],
                    game_type: { type: 'Main Game' }
                },
                { id: 2, name: 'Hades DLC', game_type: { type: 'DLC' } },
                { id: 3, name: 'Hades Mod', game_type: { type: 'Mod' } },
                { id: 4, name: 'No Type Info' }
            ])
        );
        const hits = await client.search('had"es');
        expect(hits.map((h) => h.id)).toEqual([1, 4]);
        expect(hits[0]).toMatchObject({
            name: 'Hades',
            year: 2020,
            coverImageId: 'abc',
            platforms: [{ id: 6, name: 'PC', abbreviation: 'PC' }]
        });
        const req = requests[0]!;
        expect(req.url).toBe('https://api.igdb.com/v4/games');
        expect(req.body).toContain('search "had\\"es"');
        expect(req.body).toContain('version_parent = null');
        expect(req.headers['Client-ID']).toBe('cid');
        expect(req.headers.Authorization).toBe('Bearer tok1');
    });

    it('keeps ownable games IGDB files under unexpected types, and drops only add-ons', async () => {
        // Names and types taken from live IGDB searches
        const { client } = setup(() =>
            json([
                { id: 1942, name: 'The Witcher 3: Wild Hunt', game_type: { type: 'Main Game' } },
                {
                    id: 415005,
                    name: 'The Witcher 3: Wild Hunt Remastered',
                    game_type: { type: 'Update' }
                },
                {
                    id: 27979,
                    name: 'Kingdom Hearts HD 1.5 + 2.5 Remix',
                    game_type: { type: 'Bundle' }
                },
                { id: 99, name: 'Predecessor', game_type: { type: 'Fork' } },
                { id: 98, name: 'Deltarune: Chapter 1', game_type: { type: 'Episode' } },
                {
                    id: 13166,
                    name: 'The Witcher 3: Wild Hunt - Blood and Wine',
                    game_type: { type: 'Expansion' }
                },
                {
                    id: 170450,
                    name: "The Witcher 3: Wild Hunt - New Quest 'Fool's Gold'",
                    game_type: { type: 'DLC' }
                },
                {
                    id: 283715,
                    name: 'The Witcher 3: Enhanced Edition - Redux',
                    game_type: { type: 'Mod' }
                },
                { id: 97, name: 'Some Addon Pack', game_type: { type: 'Pack / Addon' } }
            ])
        );
        const hits = await client.search('witcher');
        expect(hits.map((h) => h.id)).toEqual([1942, 415005, 27979, 99, 98, 13166]);
    });

    it('fetches a game and its time-to-beat in a single multiquery request', async () => {
        const { client, requests } = setup(() =>
            json([
                {
                    name: 'game',
                    result: [
                        {
                            id: 9,
                            name: 'Celeste',
                            slug: 'celeste',
                            first_release_date: 1516924800,
                            summary: 'Climb.',
                            cover: { image_id: 'co1' },
                            total_rating: 87.6,
                            total_rating_count: 50,
                            platforms: [{ id: 6, name: 'PC', abbreviation: 'PC' }],
                            genres: [{ id: 33, name: 'Platform' }],
                            themes: [{ id: 1, name: 'Fantasy' }],
                            game_type: { type: 'Main Game' }
                        }
                    ]
                },
                {
                    name: 'ttb',
                    result: [
                        {
                            game_id: 9,
                            hastily: 18000,
                            normally: 28800,
                            completely: 72000,
                            count: 30
                        }
                    ]
                }
            ])
        );
        const g = await client.fetchGame(9);
        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe('https://api.igdb.com/v4/multiquery');
        expect(g).toMatchObject({
            id: 9,
            name: 'Celeste',
            releaseDate: '2018-01-26',
            igdbRating: 88,
            coverImageId: 'co1',
            gameType: 'Main Game',
            genres: [{ id: 33, name: 'Platform' }],
            ttb: {
                hastilySeconds: 18000,
                normallySeconds: 28800,
                completelySeconds: 72000,
                count: 30
            }
        });
    });

    it('returns null ttb when IGDB has none, and null for unknown games', async () => {
        const withGame = setup(() =>
            json([
                { name: 'game', result: [{ id: 9, name: 'X' }] },
                { name: 'ttb', result: [] }
            ])
        );
        expect((await withGame.client.fetchGame(9))?.ttb).toBeNull();
        const none = setup(() =>
            json([
                { name: 'game', result: [] },
                { name: 'ttb', result: [] }
            ])
        );
        expect(await none.client.fetchGame(404)).toBeNull();
    });

    it('refreshes the token once on a 401 and retries', async () => {
        const { client, requests } = setup((_e, init, n) => (n === 1 ? json({}, 401) : json([])));
        await client.search('zelda');
        expect(requests.map((r) => r.headers.Authorization)).toEqual([
            'Bearer tok1',
            'Bearer tok2'
        ]);
    });

    it('backs off and retries on 429, then gives up with an IgdbError', async () => {
        const flaky = setup((_e, _i, n) =>
            n < 3 ? json({}, 429, { 'retry-after': '1' }) : json([])
        );
        await flaky.client.search('zelda');
        expect(flaky.requests).toHaveLength(3);

        const dead = setup(() => json({}, 429));
        await expect(dead.client.search('zelda')).rejects.toBeInstanceOf(IgdbError);
        expect(dead.requests).toHaveLength(4); // first try + 3 retries

        const broken = setup(() => json({}, 500));
        await expect(broken.client.search('zelda')).rejects.toMatchObject({ status: 500 });
    });

    it('maps platforms', async () => {
        const { client } = setup(() =>
            json([
                { id: 6, name: 'PC', abbreviation: 'PC' },
                { id: 7, name: 'Odd' }
            ])
        );
        expect(await client.fetchPlatforms()).toEqual([
            { id: 6, name: 'PC', abbreviation: 'PC' },
            { id: 7, name: 'Odd', abbreviation: null }
        ]);
    });
});
