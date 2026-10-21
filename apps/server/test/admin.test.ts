import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.js';
import { cookieFrom, makeApp, register } from './helpers.js';

async function setup() {
    const { app, db } = makeApp();
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const get = (headers: Record<string, string> = { cookie }) =>
        app.request('/api/admin', { headers });
    const me = async () =>
        (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
    const setRole = (role: 'gamer' | 'admin') =>
        db.update(users).set({ role }).where(eq(users.username, 'joe')).run();
    return { get, me, setRole };
}

describe('roles', () => {
    it('gives new users the gamer role', async () => {
        const { me } = await setup();
        expect((await me()).role).toBe('gamer');
    });

    it('rejects anonymous requests with 401', async () => {
        const { get } = await setup();
        expect((await get({})).status).toBe(401);
    });

    it('rejects gamers with 403', async () => {
        const { get } = await setup();
        const res = await get();
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'Admin access required' });
    });

    it('lets admins in, and the role shows on /me', async () => {
        const { get, me, setRole } = await setup();
        setRole('admin');
        expect((await get()).status).toBe(200);
        expect((await me()).role).toBe('admin');
    });

    it('applies a role change to a live session immediately', async () => {
        const { get, setRole } = await setup();
        setRole('admin');
        expect((await get()).status).toBe(200);
        setRole('gamer');
        expect((await get()).status).toBe(403);
    });
});
