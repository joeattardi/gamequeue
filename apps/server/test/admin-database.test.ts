import { eq } from 'drizzle-orm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.js';
import { cookieFrom, fakeGame, fakeIgdb, json, makeApp, register } from './helpers.js';

describe('admin database stats', () => {
    async function setup() {
        const dir = mkdtempSync(join(tmpdir(), 'gq-db-'));
        const { client } = fakeIgdb([fakeGame(1, 'Hades'), fakeGame(2, 'Celeste')]);
        const { app, db } = makeApp({ databasePath: join(dir, 'gamequeue.db') }, client);
        const cookie = cookieFrom(await register(app, 'root@example.com', undefined, 'root'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
        const get = () => app.request('/api/admin/database', { headers: { cookie } });
        return { app, cookie, get };
    }

    it('is admin only', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'ann@example.com', undefined, 'ann'));
        expect((await app.request('/api/admin/database')).status).toBe(401);
        expect((await app.request('/api/admin/database', { headers: { cookie } })).status).toBe(
            403
        );
    });

    it('reports storage, cache, content and per-table figures', async () => {
        const { app, cookie, get } = await setup();
        await app.request(
            '/api/entries',
            json({ igdbId: 1, platformIds: [6] }, { cookie, origin: 'http://localhost' })
        );
        const s = await (await get()).json();
        expect(s.sqliteVersion).toMatch(/^3\./);
        expect(s.storage.pageSize).toBeGreaterThan(0);
        expect(s.storage.pageCount).toBeGreaterThan(0);
        expect(s.cache).toMatchObject({ games: 1, gamesInUse: 1 });
        expect(s.cache.newestFetchedAt).toBeGreaterThan(0);
        expect(s.content).toMatchObject({ users: 1, entries: 1, sessions: 1, expiredSessions: 0 });
        const games = s.tables.find((t: { name: string }) => t.name === 'games');
        expect(games).toMatchObject({ rows: 1 });
        expect(games.bytes).toBeGreaterThan(0);
        const sizes = s.tables.map((t: { bytes: number }) => t.bytes);
        expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    });
});
