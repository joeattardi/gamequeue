import { describe, expect, it } from 'vitest';
import { setupApi } from './api.js';

describe('bio', () => {
    it('is empty by default, then shows on the public profile once set', async () => {
        const { app, call } = await setupApi();
        const profile = async () =>
            (await (await app.request('/api/profiles/user_me')).json()).profile;
        expect((await profile()).bio).toBeNull();
        expect((await call('/auth/me')).user.bio).toBeNull();

        const res = await call('/account/bio', 'PUT', {
            bio: '  Souls-like   addict\nbacklog: large '
        });
        expect(res.status).toBe(200);
        // trimmed, one line
        expect(res.user.bio).toBe('Souls-like addict backlog: large');
        expect((await profile()).bio).toBe('Souls-like addict backlog: large');
    });

    it('clears with an empty string', async () => {
        const { call } = await setupApi();
        await call('/account/bio', 'PUT', { bio: 'hi' });
        expect((await call('/account/bio', 'PUT', { bio: '   ' })).user.bio).toBeNull();
    });

    it('refuses an overlong bio and control characters', async () => {
        const { call } = await setupApi();
        expect((await call('/account/bio', 'PUT', { bio: 'x'.repeat(161) })).status).toBe(400);
        expect((await call('/account/bio', 'PUT', { bio: 'a\u0007b' })).status).toBe(400);
        expect((await call('/account/bio', 'PUT', { bio: 'x'.repeat(160) })).status).toBe(200);
    });

    it('needs a login', async () => {
        const { app } = await setupApi();
        const res = await app.request('/api/account/bio', {
            method: 'PUT',
            headers: { origin: 'http://localhost', 'content-type': 'application/json' },
            body: JSON.stringify({ bio: 'x' })
        });
        expect(res.status).toBe(401);
    });
});
