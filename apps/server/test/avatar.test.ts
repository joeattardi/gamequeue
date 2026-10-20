import { describe, expect, it } from 'vitest';
import { cookieFrom, json, makeApp, register } from './helpers.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([1, 0, 0, 0]),
    Buffer.from('WEBPVP8 ')
]);
const origin = 'http://localhost';

async function setup() {
    const { app } = makeApp();
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const upload = (body: unknown, who = cookie) =>
        app.request('/api/avatar', {
            ...json(body, { cookie: who, origin }),
            method: 'PUT'
        });
    const me = async () =>
        (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
    return { app, cookie, upload, me };
}

describe('avatar upload', () => {
    it('stores an image, serves it publicly and reports its version', async () => {
        const { app, upload, me } = await setup();
        expect((await me()).avatarUpdatedAt).toBeNull();
        expect((await app.request('/api/profiles/joe/avatar')).status).toBe(404);

        const res = await upload({ contentType: 'image/png', data: PNG.toString('base64') });
        expect(res.status).toBe(200);
        const { avatarUpdatedAt } = await res.json();
        expect((await me()).avatarUpdatedAt).toBe(avatarUpdatedAt);

        const img = await app.request('/api/profiles/joe/avatar');
        expect(img.status).toBe(200);
        expect(img.headers.get('content-type')).toBe('image/png');
        expect(img.headers.get('x-content-type-options')).toBe('nosniff');
        expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true);

        const profile = (await (await app.request('/api/profiles/joe')).json()).profile;
        expect(profile.avatarUpdatedAt).toBe(avatarUpdatedAt);
    });

    it('replaces an existing avatar and removes it again', async () => {
        const { app, cookie, upload, me } = await setup();
        await upload({ contentType: 'image/png', data: PNG.toString('base64') });
        await upload({ contentType: 'image/webp', data: WEBP.toString('base64') });
        expect((await app.request('/api/profiles/joe/avatar')).headers.get('content-type')).toBe(
            'image/webp'
        );
        const del = await app.request('/api/avatar', {
            method: 'DELETE',
            headers: { cookie, origin }
        });
        expect(del.status).toBe(200);
        expect((await me()).avatarUpdatedAt).toBeNull();
        expect((await app.request('/api/profiles/joe/avatar')).status).toBe(404);
    });

    it('rejects bad input', async () => {
        const { upload } = await setup();
        // Declared type doesn't match the bytes (e.g. an SVG or HTML sent as png)
        expect(
            (
                await upload({
                    contentType: 'image/png',
                    data: Buffer.from('<svg/>').toString('base64')
                })
            ).status
        ).toBe(400);
        expect((await upload({ contentType: 'image/svg+xml', data: 'AAAA' })).status).toBe(400);
        expect((await upload({ contentType: 'image/png', data: 'not base64!' })).status).toBe(400);
        const big = Buffer.concat([PNG, Buffer.alloc(200 * 1024)]);
        expect(
            (await upload({ contentType: 'image/png', data: big.toString('base64') })).status
        ).toBeGreaterThanOrEqual(400);
    });

    it('requires login to change an avatar', async () => {
        const { upload } = await setup();
        const res = await upload({ contentType: 'image/png', data: PNG.toString('base64') }, '');
        expect(res.status).toBe(401);
    });
});
