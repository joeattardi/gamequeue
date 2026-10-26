import {
    fakeGame,
    fakeIgdb,
    json,
    makeApp,
    cookieFrom,
    register,
    PC,
    PS5,
    SWITCH
} from './helpers.js';

import type { ItadClient } from '../src/itad/types.js';

export { PC, PS5, SWITCH, json, cookieFrom };

export const CATALOG = [
    fakeGame(1, 'Hades'),
    fakeGame(2, 'Celeste', {
        platforms: [PC, SWITCH],
        ttb: { hastilySeconds: 18000, normallySeconds: 28800, completelySeconds: 72000, count: 5 }
    }),
    fakeGame(3, 'Hollow Knight'),
    fakeGame(4, 'Outer Wilds', { ttb: null })
];

/** An app with one signed-in user and small helpers for the JSON API. */
export async function setupApi(catalog = CATALOG, itad?: ItadClient) {
    const igdb = fakeIgdb(catalog).client;
    const { app, db } = makeApp({}, igdb, itad);
    const cookie = cookieFrom(await register(app));
    const request = (path: string, method = 'GET', body?: unknown, who = cookie) =>
        app.request(`/api${path}`, {
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            headers: {
                origin: 'http://localhost',
                cookie: who,
                ...(body === undefined ? {} : { 'content-type': 'application/json' })
            }
        });
    const call = async (path: string, method = 'GET', body?: unknown, who = cookie) => {
        const res = await request(path, method, body, who);
        return { status: res.status, ...(await res.json()) } as Record<string, any> & {
            status: number;
        };
    };
    const add = async (igdbId: number, platformIds = [PC.id], tags?: string[]) =>
        (await call('/entries', 'POST', { igdbId, platformIds, tags })).entry as Record<
            string,
            any
        >;
    const secondUser = async () =>
        cookieFrom(
            await app.request(
                '/api/auth/register',
                json({
                    username: 'user_two',
                    email: 'two@example.com',
                    password: 'another long pass'
                })
            )
        );
    const userId = ((await call('/auth/me')).user as { id: number }).id;
    return { app, db, igdb, userId, cookie, call, add, secondUser };
}
