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
