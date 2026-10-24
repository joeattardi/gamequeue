import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { mountWeb } from '../src/web.js';
import { cookieFrom, json, makeApp, register } from './helpers.js';

const HTML = '<html><head><title>GameQueue</title></head><body><div id="root"></div></body></html>';

async function setup() {
    const { app, db, config } = makeApp({ publicUrl: 'https://games.example' });
    const cookie = cookieFrom(await register(app, 'me@example.com', undefined, 'joe'));
    const setIndexable = (searchIndexable: unknown) =>
        app.request('/api/account/search-indexing', {
            ...json({ searchIndexable }, { cookie, origin: 'http://localhost' }),
            method: 'PUT'
        });

    const root = join(process.cwd(), 'node_modules', '.cache', 'seo-test-web');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'index.html'), HTML);
    const web = new Hono();
    mountWeb(web, { db, config }, root);
    return { app, cookie, setIndexable, web };
}

describe('search indexing opt-in', () => {
    it('is off by default and can be switched on and off', async () => {
        const { app, cookie, setIndexable } = await setup();
        const me = async () =>
            (await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user;
        expect((await me()).searchIndexable).toBe(false);

        const res = await setIndexable(true);
        expect(res.status).toBe(200);
        expect((await res.json()).user.searchIndexable).toBe(true);
        expect((await me()).searchIndexable).toBe(true);

        await setIndexable(false);
        expect((await me()).searchIndexable).toBe(false);
    });

    it('rejects a non-boolean value and anonymous callers', async () => {
        const { app, setIndexable } = await setup();
        expect((await setIndexable('yes')).status).toBe(400);
        const anon = await app.request('/api/account/search-indexing', {
            ...json({ searchIndexable: true }, { origin: 'http://localhost' }),
            method: 'PUT'
        });
        expect(anon.status).toBe(401);
    });
});

describe('crawler rules', () => {
    it('serves robots.txt that blocks the API but not share cards', async () => {
        const { web } = await setup();
        const res = await web.request('/robots.txt');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/plain');
        const text = await res.text();
        expect(text).toContain('Disallow: /api/');
        expect(text).toContain('Allow: /api/og/');
        expect(text).not.toContain('/u/');
    });

    it('adds a description and canonical to the landing page, which is indexable', async () => {
        const { web } = await setup();
        const res = await web.request('/');
        const html = await res.text();
        expect(res.status).toBe(200);
        expect(res.headers.get('x-robots-tag')).toBeNull();
        expect(html).toContain('<link rel="canonical" href="https://games.example/" />');
        expect(html).toContain('name="description"');
        expect(html).toContain('name="twitter:card" content="summary"');
        expect(html).not.toContain('og:image');
    });

    it('marks profile pages noindex until the owner opts in', async () => {
        const { web, setIndexable } = await setup();
        for (const path of ['/u/joe', '/u/joe/wishlist', '/u/joe/recap']) {
            const res = await web.request(path);
            expect(res.status, path).toBe(200);
            expect(res.headers.get('x-robots-tag'), path).toBe('noindex');
        }
        // Link previews are not part of the opt-in
        expect(await (await web.request('/u/joe')).text()).toContain('og:image');

        await setIndexable(true);
        for (const path of ['/u/joe', '/u/joe/wishlist', '/u/joe/recap']) {
            const res = await web.request(path);
            expect(res.status, path).toBe(200);
            expect(res.headers.get('x-robots-tag'), path).toBeNull();
        }

        await setIndexable(false);
        expect((await web.request('/u/joe')).headers.get('x-robots-tag')).toBe('noindex');
    });

    it('answers 404 for users that do not exist, still with the app shell', async () => {
        const { web } = await setup();
        for (const path of ['/u/nobody', '/u/nobody/stats', '/u/%E0%A4%A', '/u/a']) {
            const res = await web.request(path);
            expect(res.status, path).toBe(404);
            expect(res.headers.get('x-robots-tag'), path).toBe('noindex');
            expect(await res.text(), path).toBe(HTML);
        }
    });

    it('marks login, register and the signed-in app noindex', async () => {
        const { web } = await setup();
        for (const path of ['/login', '/register', '/collection', '/admin']) {
            const res = await web.request(path);
            expect(res.status, path).toBe(200);
            expect(res.headers.get('x-robots-tag'), path).toBe('noindex');
        }
    });
});
