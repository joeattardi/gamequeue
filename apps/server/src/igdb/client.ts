import { RequestLimiter } from './limiter.js';
import { isCollectable, mapGame, mapSearchHit, type RawGame, type RawTtb } from './mappers.js';
import { TokenProvider } from './token.js';
import { IgdbError, type IgdbClient } from './types.js';

const BASE = 'https://api.igdb.com/v4';
const GAME_FIELDS =
    'name,slug,summary,first_release_date,cover.image_id,platforms.name,platforms.abbreviation,' +
    'genres.name,themes.name,total_rating,total_rating_count,game_type.type';
const MAX_429_RETRIES = 3;

export interface IgdbClientOptions {
    clientId: string;
    clientSecret: string;
    fetchFn?: typeof fetch;
    limiter?: RequestLimiter;
    tokens?: TokenProvider;
    sleep?: (ms: number) => Promise<void>;
}

/** APICalypse string literals: backslash and double quote must be escaped. */
export const quote = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;

export function createIgdbClient(opts: IgdbClientOptions): IgdbClient {
    const fetchFn = opts.fetchFn ?? fetch;
    const limiter = opts.limiter ?? new RequestLimiter();
    const tokens = opts.tokens ?? new TokenProvider(opts.clientId, opts.clientSecret, fetchFn);
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

    async function request<T>(endpoint: string, body: string): Promise<T> {
        let refreshedToken = false;
        for (let attempt = 0; ; attempt++) {
            const res = await limiter.schedule(async () =>
                fetchFn(`${BASE}/${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Client-ID': opts.clientId,
                        Authorization: `Bearer ${await tokens.get()}`,
                        Accept: 'application/json'
                    },
                    body
                })
            );
            if (res.ok) return (await res.json()) as T;
            if (res.status === 401 && !refreshedToken) {
                refreshedToken = true;
                tokens.invalidate();
                continue;
            }
            if (res.status === 429 && attempt < MAX_429_RETRIES) {
                const retryAfter = Number(res.headers.get('retry-after'));
                await sleep((retryAfter > 0 ? retryAfter : 1) * 1000 * (attempt + 1));
                continue;
            }
            throw new IgdbError(`IGDB request to ${endpoint} failed (${res.status})`, res.status);
        }
    }

    return {
        async search(query) {
            const raw = await request<RawGame[]>(
                'games',
                `search ${quote(query)}; fields ${GAME_FIELDS}; where version_parent = null; limit 30;`
            );
            return raw.filter(isCollectable).map(mapSearchHit).slice(0, 20);
        },

        async fetchGame(igdbId) {
            // One round trip for the game plus its time-to-beat
            const results = await request<{ name: string; result: unknown[] }[]>(
                'multiquery',
                `query games "game" { fields ${GAME_FIELDS}; where id = ${igdbId}; };\n` +
                    `query game_time_to_beats "ttb" { fields game_id,hastily,normally,completely,count; where game_id = ${igdbId}; };`
            );
            const game = results.find((r) => r.name === 'game')?.result[0] as RawGame | undefined;
            if (!game) return null;
            const ttb = results.find((r) => r.name === 'ttb')?.result[0] as RawTtb | undefined;
            return mapGame(game, ttb);
        },

        async fetchPlatforms() {
            const raw = await request<{ id: number; name: string; abbreviation?: string }[]>(
                'platforms',
                'fields name,abbreviation; limit 500; sort name asc;'
            );
            return raw.map((p) => ({
                id: p.id,
                name: p.name,
                abbreviation: p.abbreviation ?? null
            }));
        }
    };
}
