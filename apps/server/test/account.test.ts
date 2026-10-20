import { describe, expect, it } from 'vitest';
import { cookieFrom, json, makeApp, register } from './helpers.js';

async function setup() {
    const { app } = makeApp();
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const patch = (body: unknown, who = cookie) =>
        app.request('/api/account', {
            ...json(body, { cookie: who, origin: 'http://localhost' }),
            method: 'PATCH'
        });
    const me = async () =>
        (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
    const profile = async () => (await (await app.request('/api/profiles/joe')).json()).profile;
    return { patch, me, profile };
}

describe('account name', () => {
    it('starts empty and private', async () => {
        const { me, profile } = await setup();
        expect(await me()).toMatchObject({ firstName: null, lastName: null, showRealName: false });
        expect((await profile()).realName).toBeNull();
    });

    it('saves trimmed names and returns them on /me', async () => {
        const { patch, me } = await setup();
        const res = await patch({
            firstName: '  Ada ',
            lastName: 'Love   lace',
            showRealName: false
        });
        expect(res.status).toBe(200);
        expect((await res.json()).user).toMatchObject({ firstName: 'Ada', lastName: 'Love lace' });
        expect(await me()).toMatchObject({ firstName: 'Ada', lastName: 'Love lace' });
    });

    it('only exposes the real name on the profile when the user opted in', async () => {
        const { patch, profile } = await setup();
        await patch({ firstName: 'Ada', lastName: 'Lovelace', showRealName: false });
        expect((await profile()).realName).toBeNull();
        expect(JSON.stringify(await profile())).not.toContain('Ada');

        await patch({ firstName: 'Ada', lastName: 'Lovelace', showRealName: true });
        expect((await profile()).realName).toBe('Ada Lovelace');

        await patch({ firstName: 'Ada', lastName: '', showRealName: true });
        expect((await profile()).realName).toBe('Ada');

        await patch({ firstName: '', lastName: '', showRealName: true });
        expect((await profile()).realName).toBeNull();
    });

    it('rejects bad input and anonymous requests', async () => {
        const { patch } = await setup();
        expect(
            (await patch({ firstName: 'x'.repeat(51), lastName: '', showRealName: false })).status
        ).toBe(400);
        expect(
            (await patch({ firstName: 'a\u0000b', lastName: '', showRealName: false })).status
        ).toBe(400);
        expect((await patch({ firstName: 'Ada', lastName: '' })).status).toBe(400);
        expect((await patch({ firstName: '', lastName: '', showRealName: false }, '')).status).toBe(
            401
        );
    });
});

describe('social links', () => {
    const none = { steam: '', xbox: '', playstation: '', discord: '' };
    async function setupSocial() {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
        const put = (body: unknown, who = cookie) =>
            app.request('/api/account/social', {
                ...json(body, { cookie: who, origin: 'http://localhost' }),
                method: 'PUT'
            });
        const profile = async () => (await (await app.request('/api/profiles/joe')).json()).profile;
        return { app, cookie, put, profile };
    }

    it('starts empty, saves, shows on /me and the public profile, and clears', async () => {
        const { app, cookie, put, profile } = await setupSocial();
        expect((await profile()).socialLinks).toEqual({
            steam: null,
            xbox: null,
            playstation: null,
            discord: null
        });

        const res = await put({ ...none, steam: 'gaben', discord: '@joe.d' });
        expect(res.status).toBe(200);
        const expected = { steam: 'gaben', xbox: null, playstation: null, discord: 'joe.d' };
        expect((await res.json()).user.socialLinks).toEqual(expected);
        expect((await profile()).socialLinks).toEqual(expected);
        const me = (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
        expect(me.socialLinks).toEqual(expected);

        await put(none);
        expect((await profile()).socialLinks.steam).toBeNull();
    });

    it('rejects invalid values and anonymous requests', async () => {
        const { put } = await setupSocial();
        expect((await put({ ...none, steam: 'a/b' })).status).toBe(400);
        expect((await put({ ...none, xbox: '<b>' })).status).toBe(400);
        expect((await put({ steam: 'gaben' })).status).toBe(400);
        expect((await put(none, '')).status).toBe(401);
    });

    it("doesn't touch the name settings", async () => {
        const { app, cookie, put } = await setupSocial();
        await app.request('/api/account', {
            ...json(
                { firstName: 'Ada', lastName: '', showRealName: false },
                { cookie, origin: 'http://localhost' }
            ),
            method: 'PATCH'
        });
        await put({ ...none, steam: 'gaben' });
        const me = (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
        expect(me.firstName).toBe('Ada');
    });
});

describe('change password', () => {
    const OLD = 'correct horse battery';
    const NEW = 'a brand new passphrase';

    async function setupPw() {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app, 'me@example.com', OLD, 'joe'));
        const put = (body: unknown, who = cookie) =>
            app.request('/api/account/password', {
                ...json(body, { cookie: who, origin: 'http://localhost' }),
                method: 'PUT'
            });
        const login = async (password: string) =>
            app.request('/api/auth/login', json({ username: 'joe', password }));
        const meStatus = async (who: string) =>
            (await app.request('/api/auth/me', { headers: { cookie: who } })).status;
        return { app, cookie, put, login, meStatus };
    }

    it('changes the password, keeps this session and signs out the others', async () => {
        const { cookie, put, login, meStatus } = await setupPw();
        const other = cookieFrom(await login(OLD));
        expect(await meStatus(other)).toBe(200);

        const res = await put({ currentPassword: OLD, newPassword: NEW });
        expect(res.status).toBe(200);
        expect(await meStatus(cookie)).toBe(200);
        expect(await meStatus(other)).toBe(401);
        expect((await login(OLD)).status).toBe(401);
        expect((await login(NEW)).status).toBe(200);
    });

    it('rejects a wrong current password, pointing at that field', async () => {
        const { put, login } = await setupPw();
        const res = await put({ currentPassword: 'nope nope nope', newPassword: NEW });
        expect(res.status).toBe(400);
        expect((await res.json()).details[0].path).toBe('currentPassword');
        expect((await login(OLD)).status).toBe(200);
    });

    it('validates the new password and requires login', async () => {
        const { put } = await setupPw();
        expect((await put({ currentPassword: OLD, newPassword: 'short' })).status).toBe(400);
        expect((await put({ currentPassword: OLD, newPassword: OLD })).status).toBe(400);
        expect((await put({ currentPassword: OLD, newPassword: NEW }, '')).status).toBe(401);
    });

    it('rate limits repeated wrong guesses', async () => {
        const { put } = await setupPw();
        for (let i = 0; i < 5; i++)
            expect((await put({ currentPassword: 'wrong wrong', newPassword: NEW })).status).toBe(
                400
            );
        const res = await put({ currentPassword: OLD, newPassword: NEW });
        expect(res.status).toBe(429);
    });
});
