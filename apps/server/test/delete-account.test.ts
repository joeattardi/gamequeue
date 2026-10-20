import { eq, getTableColumns, sql } from 'drizzle-orm';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema.js';
import { users } from '../src/db/schema.js';
import { cookieFrom, fakeGame, fakeIgdb, json, makeApp, register } from './helpers.js';

const PW = 'correct horse battery';
const origin = 'http://localhost';

async function setup() {
    const { client } = fakeIgdb([fakeGame(1, 'Hades'), fakeGame(2, 'Celeste')]);
    const { app, db } = makeApp({}, client);
    const joe = cookieFrom(await register(app, 'joe@example.com', PW, 'joe'));
    const ann = cookieFrom(await register(app, 'ann@example.com', PW, 'ann'));
    const call = (cookie: string, path: string, method: string, body?: unknown) =>
        app.request(`/api${path}`, {
            ...json(body ?? {}, { cookie, origin }),
            method
        });
    const populate = async (cookie: string) => {
        const entry = (
            await (await call(cookie, '/entries', 'POST', { igdbId: 1, platformIds: [6] })).json()
        ).entry;
        await call(cookie, '/entries', 'POST', { igdbId: 2, platformIds: [6] });
        await call(cookie, `/entries/${entry.id}/start`, 'POST', {});
        const list = (await (await call(cookie, '/lists', 'POST', { name: 'Faves' })).json()).list;
        await call(cookie, `/lists/${list.id}/items`, 'POST', { entryId: entry.id });
        await call(cookie, '/queue/items', 'POST', { entryId: entry.id });
        await call(cookie, '/account/social', 'PUT', {
            steam: 'x1',
            xbox: '',
            playstation: '',
            discord: ''
        });
    };
    return { app, db, joe, ann, call, populate };
}

/** Rows owned by a user, across every table that has a user_id column. */
function userRows(db: ReturnType<typeof makeApp>['db'], userId: number) {
    let total = 0;
    for (const table of Object.values(schema)) {
        const t = table as SQLiteTable;
        let name: string;
        try {
            name = getTableConfig(t).name;
        } catch {
            continue;
        }
        if (!('userId' in getTableColumns(t))) continue;
        total += db.get<{ n: number }>(
            sql.raw(`select count(*) as n from "${name}" where user_id = ${userId}`)
        ).n;
    }
    return total;
}

describe('delete account', () => {
    it('removes the user and all their data, and leaves other users alone', async () => {
        const { app, db, joe, ann, call, populate } = await setup();
        await populate(joe);
        await populate(ann);
        const joeId = db.select().from(users).where(eq(users.username, 'joe')).get()!.id;
        const annId = db.select().from(users).where(eq(users.username, 'ann')).get()!.id;
        expect(userRows(db, joeId)).toBeGreaterThan(5);
        const annBefore = userRows(db, annId);

        const res = await call(joe, '/account', 'DELETE', { password: PW });
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toContain('gq_session=;');

        expect(userRows(db, joeId)).toBe(0);
        expect(db.select().from(users).where(eq(users.id, joeId)).get()).toBeUndefined();
        expect(userRows(db, annId)).toBe(annBefore);
        expect((await app.request('/api/profiles/joe')).status).toBe(404);
        expect((await app.request('/api/auth/me', { headers: { cookie: joe } })).status).toBe(401);
        expect(
            (await app.request('/api/auth/login', json({ username: 'joe', password: PW }))).status
        ).toBe(401);
        expect((await app.request('/api/auth/me', { headers: { cookie: ann } })).status).toBe(200);
    });

    it('needs the right password and a session', async () => {
        const { app, db, joe, call } = await setup();
        const res = await call(joe, '/account', 'DELETE', { password: 'wrong wrong' });
        expect(res.status).toBe(400);
        expect((await res.json()).details[0].path).toBe('password');
        expect((await call(joe, '/account', 'DELETE', {})).status).toBe(400);
        expect((await call('', '/account', 'DELETE', { password: PW })).status).toBe(401);
        expect(db.select().from(users).all()).toHaveLength(2);
        expect((await app.request('/api/profiles/joe')).status).toBe(200);
    });

    it('rate limits wrong passwords', async () => {
        const { joe, call } = await setup();
        for (let i = 0; i < 5; i++)
            expect(
                (await call(joe, '/account', 'DELETE', { password: 'wrong wrong' })).status
            ).toBe(400);
        expect((await call(joe, '/account', 'DELETE', { password: PW })).status).toBe(429);
    });
});
