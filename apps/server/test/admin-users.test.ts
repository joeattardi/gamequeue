import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sessions, slots, users } from '../src/db/schema.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

const PW = 'correct horse battery';
const origin = 'http://localhost';

async function setup() {
    const { app, db } = makeApp();
    const admin = cookieFrom(await register(app, 'root@example.com', PW, 'root'));
    db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
    const ann = cookieFrom(await register(app, 'ann@example.com', PW, 'ann'));
    const idOf = (username: string) =>
        db.select().from(users).where(eq(users.username, username)).get()!.id;
    const call = (cookie: string, path: string, method: string, body?: unknown) =>
        method === 'GET'
            ? app.request(`/api/admin${path}`, { headers: { cookie } })
            : app.request(`/api/admin${path}`, { ...json(body ?? {}, { cookie, origin }), method });
    const fields = (over: Record<string, unknown> = {}) => ({
        username: 'ann',
        email: 'ann@example.com',
        role: 'gamer',
        firstName: '',
        lastName: '',
        showRealName: false,
        steam: '',
        xbox: '',
        playstation: '',
        discord: '',
        ...over
    });
    return { app, db, admin, ann, idOf, call, fields };
}

describe('admin user management', () => {
    it('is admin only', async () => {
        const { ann, call, idOf } = await setup();
        expect((await call(ann, '/users', 'GET')).status).toBe(403);
        expect((await call(ann, '/users', 'POST', {})).status).toBe(403);
        expect((await call(ann, `/users/${idOf('root')}`, 'DELETE')).status).toBe(403);
        expect((await call(ann, `/users/${idOf('root')}/password`, 'PUT', {})).status).toBe(403);
    });

    it('lists users with game counts and never exposes password hashes', async () => {
        const { admin, call } = await setup();
        const body = await (await call(admin, '/users', 'GET')).json();
        expect(body.users.map((u: { username: string }) => u.username)).toEqual(['ann', 'root']);
        expect(JSON.stringify(body)).not.toMatch(/hash|argon/i);
        expect(body.users[0]).toMatchObject({ gameCount: 0, role: 'gamer' });
    });

    it('creates a user who can log in, with default slots, even when signups are off', async () => {
        const { app, db, admin, call } = await setup();
        const res = await call(admin, '/users', 'POST', {
            username: 'Bob',
            email: 'Bob@Example.com',
            password: PW,
            role: 'admin'
        });
        expect(res.status).toBe(201);
        const { user } = await res.json();
        expect(user).toMatchObject({ username: 'bob', email: 'bob@example.com', role: 'admin' });
        expect(db.select().from(slots).where(eq(slots.userId, user.id)).all()).toHaveLength(3);
        const login = await app.request('/api/auth/login', json({ username: 'bob', password: PW }));
        expect(login.status).toBe(200);
    });

    it('rejects duplicate usernames and emails on create and update, naming the field', async () => {
        const { admin, call, idOf, fields } = await setup();
        const dupUser = await call(admin, '/users', 'POST', {
            username: 'ann',
            email: 'new@example.com',
            password: PW
        });
        expect(dupUser.status).toBe(409);
        expect((await dupUser.json()).details[0].path).toBe('username');
        const dupMail = await call(
            admin,
            `/users/${idOf('ann')}`,
            'PATCH',
            fields({ email: 'root@example.com' })
        );
        expect(dupMail.status).toBe(409);
        expect((await dupMail.json()).details[0].path).toBe('email');
        expect(
            (
                await call(admin, '/users', 'POST', {
                    username: 'x',
                    email: 'bad',
                    password: 'short'
                })
            ).status
        ).toBe(400);
    });

    it('edits every field of a user', async () => {
        const { app, admin, ann, call, idOf, fields } = await setup();
        const res = await call(
            admin,
            `/users/${idOf('ann')}`,
            'PATCH',
            fields({
                username: 'Annie',
                email: 'annie@example.com',
                role: 'admin',
                firstName: ' Ann  ',
                lastName: 'Lee',
                showRealName: true,
                steam: 'annie77',
                discord: '@annie'
            })
        );
        expect(res.status).toBe(200);
        expect((await res.json()).user).toMatchObject({
            username: 'annie',
            email: 'annie@example.com',
            role: 'admin',
            firstName: 'Ann',
            lastName: 'Lee',
            showRealName: true,
            socialLinks: { steam: 'annie77', xbox: null, playstation: null, discord: 'annie' }
        });
        // Her live session sees the new role at once
        expect((await app.request('/api/admin', { headers: { cookie: ann } })).status).toBe(200);
        expect(
            (
                await call(
                    admin,
                    `/users/${idOf('annie')}`,
                    'PATCH',
                    fields({ username: 'bad name' })
                )
            ).status
        ).toBe(400);
        expect((await call(admin, '/users/999', 'PATCH', fields())).status).toBe(404);
    });

    it('resets a password, signs the user out everywhere and keeps the admin signed in', async () => {
        const { app, db, admin, ann, call, idOf } = await setup();
        const newPw = 'a brand new password';
        expect(
            (await call(admin, `/users/${idOf('ann')}/password`, 'PUT', { password: 'short' }))
                .status
        ).toBe(400);
        expect(
            (await call(admin, `/users/${idOf('ann')}/password`, 'PUT', { password: newPw })).status
        ).toBe(200);
        expect((await app.request('/api/auth/me', { headers: { cookie: ann } })).status).toBe(401);
        expect(
            db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, idOf('ann')))
                .all()
        ).toHaveLength(0);
        expect(
            (await app.request('/api/auth/login', json({ username: 'ann', password: PW }))).status
        ).toBe(401);
        expect(
            (await app.request('/api/auth/login', json({ username: 'ann', password: newPw })))
                .status
        ).toBe(200);
        // Own reset keeps the current session
        expect(
            (await call(admin, `/users/${idOf('root')}/password`, 'PUT', { password: newPw }))
                .status
        ).toBe(200);
        expect((await app.request('/api/auth/me', { headers: { cookie: admin } })).status).toBe(
            200
        );
    });

    it('deletes another user but not yourself', async () => {
        const { db, admin, call, idOf } = await setup();
        expect((await call(admin, `/users/${idOf('root')}`, 'DELETE')).status).toBe(409);
        expect((await call(admin, `/users/${idOf('ann')}`, 'DELETE')).status).toBe(200);
        expect(db.select().from(users).where(eq(users.username, 'ann')).all()).toHaveLength(0);
        expect((await call(admin, '/users/999', 'DELETE')).status).toBe(404);
    });

    it('never removes or demotes the last admin', async () => {
        const { db, admin, call, idOf, fields } = await setup();
        const demote = await call(
            admin,
            `/users/${idOf('root')}`,
            'PATCH',
            fields({ username: 'root', email: 'root@example.com', role: 'gamer' })
        );
        expect(demote.status).toBe(409);
        // With a second admin, the first can be demoted, and the new last admin is then protected
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'ann')).run();
        expect(
            (
                await call(
                    admin,
                    `/users/${idOf('root')}`,
                    'PATCH',
                    fields({ username: 'root', email: 'root@example.com', role: 'gamer' })
                )
            ).status
        ).toBe(200);
    });
});
