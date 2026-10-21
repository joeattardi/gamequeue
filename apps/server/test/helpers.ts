import { createApp } from '../src/app.js';
import { FailureLimiter } from '../src/auth/rate-limit.js';
import { loadConfig, type Config } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import type { GameRecord, IgdbClient } from '../src/igdb/types.js';

export function makeApp(overrides: Partial<Config> = {}, igdb?: IgdbClient) {
    const db = openDb(':memory:');
    const config = { ...loadConfig({}), ...overrides };
    const limiters = {
        loginByAccount: new FailureLimiter(5, 60_000),
        loginByIp: new FailureLimiter(30, 60_000)
    };
    const app = createApp({ db, config, limiters, igdb });
    return { app, db, config };
}

type App = ReturnType<typeof makeApp>['app'];

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
});

export const cookieFrom = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

export async function register(
    app: App,
    email = 'me@example.com',
    password = 'correct horse battery',
    username = `user_${email
        .split('@')[0]!
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')}`
) {
    return app.request('/api/auth/register', json({ username, email, password }));
}

export const PS5 = { id: 167, name: 'PlayStation 5', abbreviation: 'PS5' };
export const PC = { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' };
export const SWITCH = { id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' };

export function fakeGame(id: number, name: string, extra: Partial<GameRecord> = {}): GameRecord {
    return {
        id,
        name,
        slug: name.toLowerCase().replace(/\W+/g, '-'),
        summary: `${name} summary`,
        releaseDate: '2020-05-01',
        releasePrecision: 'day',
        series: [],
        screenshots: [],
        coverImageId: `co${id}`,
        igdbRating: 80,
        igdbRatingCount: 100,
        gameType: 'Main Game',
        platforms: [PC, PS5],
        genres: [{ id: 12, name: 'Role-playing (RPG)' }],
        themes: [{ id: 1, name: 'Fantasy' }],
        ttb: {
            hastilySeconds: 36000,
            normallySeconds: 72000,
            completelySeconds: 144000,
            count: 10
        },
        ...extra
    };
}

/** In-memory IGDB stand-in that counts calls, so tests can prove caching. */
export function fakeIgdb(catalog: GameRecord[]) {
    const calls = {
        search: 0,
        fetchGame: 0,
        fetchPlatforms: 0,
        fetchReleaseDates: 0,
        fetchGameSeries: 0,
        fetchScreenshots: 0,
        fetchSeries: 0
    };
    const client: IgdbClient = {
        async search(q) {
            calls.search++;
            return catalog
                .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
                .map((g) => ({
                    id: g.id,
                    name: g.name,
                    year: g.releaseDate ? Number(g.releaseDate.slice(0, 4)) : null,
                    coverImageId: g.coverImageId,
                    rating: g.igdbRating,
                    platforms: g.platforms
                }));
        },
        async fetchGame(id) {
            calls.fetchGame++;
            return catalog.find((g) => g.id === id) ?? null;
        },
        async fetchReleaseDates(ids) {
            calls.fetchReleaseDates++;
            return catalog
                .filter((g) => ids.includes(g.id))
                .map((g) => ({
                    id: g.id,
                    releaseDate: g.releaseDate,
                    releasePrecision: g.releasePrecision
                }));
        },
        async fetchGameSeries(ids) {
            calls.fetchGameSeries++;
            return catalog
                .filter((g) => ids.includes(g.id))
                .map((g) => ({ id: g.id, series: g.series }));
        },
        async fetchScreenshots(id) {
            calls.fetchScreenshots++;
            return catalog.find((g) => g.id === id)?.screenshots ?? null;
        },
        async fetchSeries(id) {
            calls.fetchSeries++;
            const members = catalog.filter((g) => g.series.some((s) => s.id === id));
            const name = members[0]?.series.find((s) => s.id === id)?.name;
            if (!name) return null;
            return {
                id,
                name,
                games: [...members]
                    .sort((a, b) => (a.releaseDate ?? '9').localeCompare(b.releaseDate ?? '9'))
                    .map((g) => ({
                        id: g.id,
                        name: g.name,
                        coverImageId: g.coverImageId,
                        releaseDate: g.releaseDate,
                        releasePrecision: g.releasePrecision
                    }))
            };
        },
        async fetchPlatforms() {
            calls.fetchPlatforms++;
            return [PC, PS5, SWITCH];
        }
    };
    return { client, calls };
}
