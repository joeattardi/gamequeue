import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { FailureLimiter } from '../src/auth/rate-limit.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { createCoverLoader } from '../src/og/covers.js';
import { LruCache } from '../src/og/lru.js';
import { injectMeta, pageMeta } from '../src/og/meta.js';
import { avatarDataUri, createCardRenderer } from '../src/og/render.js';
import sharp from 'sharp';
import { setAvatar } from '../src/services/avatars.js';
import { spaFallback } from '../src/web.js';
import { PC, setupApi } from './api.js';
import { fakeGame, fakeIgdb } from './helpers.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
// Smallest valid JPEG for covers; a 64x64 WebP (what the web client uploads) for avatars
const JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64'
);
const WEBP =
    'UklGRpYDAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggqAEAAJASAJ0BKkAAQAA+MRaJQyIhKKGoCKkQBglAFiPUt+n4X8ivZeqn943q0n3Cv7bvYA/EDqAP6Bo//R/+iP/O94k/3H9y6wCO/4pIudMX+d4YxbluXWxLLEmPncC+4pmbRNjN8lNuWVDEesS16eWkv+LMD2WVYy1lR80LplE/8L++hqgBHZY7bRotiX/dXElRKihfuDVyfq24kXqlDgAA/UQU+Lqf74EJ17PuMz/7y4/uwhruwhr9vfo3g2+T9Zg7NLXlqkbpIf2ShAj0+pLwIbfCpAVItcDXpRTtiSLlS/wmnedHRTbhkj/CAyI4n/TquwxTted91ht7t+UR3+9zVPLcyaaAavti92h1DFa/2N+WAub/Lj3eyyT5xzJGeyfjwP4EHIhDWuWv1UyLjMWnxTeJucvQ5Bk4iPXA1P+ZOcYwR1ru9HmneIP/UTyM2OyRNatNwEp/J/5N8MPu9NZaRK2idS6/kdyinag+4jaFYJEKYB6NQdkbQJ+eX3Za1ZHxj3DUMNT+icgCgDBJRHldPMf4wnNGT6ojw4PUaET1UxiKpLSVTuRxQAA=';

const coverFetch = (status = 200) =>
    vi.fn(async () => new Response(status === 200 ? JPEG : 'nope', { status }));

async function setup(fetchImpl = coverFetch()) {
    const s = await setupApi();
    const config = loadConfig({ PUBLIC_URL: 'https://games.example/' });
    const cards = createCardRenderer({ fetch: fetchImpl });
    const app = createApp({
        db: s.db,
        config,
        igdb: fakeIgdb([fakeGame(1, 'Hades')]).client,
        cards,
        limiters: {
            loginByAccount: new FailureLimiter(5, 60_000),
            loginByIp: new FailureLimiter(30, 60_000)
        }
    });
    return { ...s, app, config, cards, fetchImpl };
}

const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer());

describe('share card images', () => {
    it('serves the profile card as a PNG without logging in', async () => {
        const { app, add, call } = await setup();
        const hades = await add(1, [PC.id]);
        const slots = (await call('/slots')).slots;
        await call(`/slots/${slots[0].id}/entry`, 'PUT', { entryId: hades.id });

        const res = await app.request('/api/og/profile/user_me.png');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect([...(await bytes(res)).subarray(0, 4)]).toEqual(PNG_MAGIC);
    });

    it('serves the recap card for a year, and still draws when covers cannot be fetched', async () => {
        const { app, add, call } = await setup(coverFetch(404));
        const hades = await add(1, [PC.id]);
        await call(`/entries/${hades.id}/playthroughs`, 'POST', {
            outcome: 'finished',
            endedOn: '2024-05-05'
        });
        const res = await app.request('/api/og/recap/user_me/2024.png');
        expect(res.status).toBe(200);
        expect([...(await bytes(res)).subarray(0, 4)]).toEqual(PNG_MAGIC);
    });

    it('draws an uploaded WebP avatar', async () => {
        const { app, db } = await setup();
        setAvatar(db, 1, 'image/webp', WEBP);
        const res = await app.request('/api/og/profile/user_me.png');
        expect(res.status).toBe(200);
        expect([...(await bytes(res)).subarray(0, 4)]).toEqual(PNG_MAGIC);
    });

    it('converts avatars to PNG for the renderer, and falls back when the file is corrupt', async () => {
        const uri = await avatarDataUri({
            contentType: 'image/webp',
            data: Buffer.from(WEBP, 'base64')
        });
        expect(uri).toMatch(/^data:image\/png;base64,/);
        const image = sharp(Buffer.from(uri!.split(',')[1]!, 'base64'));
        expect(await image.metadata()).toMatchObject({ format: 'png', width: 192, height: 192 });
        // Near the top-left the test image is the gradient's pink-red end, and opaque
        const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const at = (20 * 192 + 20) * 4;
        expect(data[at + 3]).toBe(255);
        expect(data[at]).toBeGreaterThan(200);

        expect(await avatarDataUri(null)).toBeNull();
        expect(
            await avatarDataUri({ contentType: 'image/webp', data: Buffer.from('nope') })
        ).toBeNull();
    });

    it('404s for unknown users and for URLs we never hand out', async () => {
        const { app } = await setup();
        for (const path of [
            '/api/og/profile/nobody.png',
            '/api/og/profile/user_me', // no .png
            '/api/og/profile/Bad%20Name.png',
            '/api/og/recap/nobody/2024.png',
            '/api/og/recap/user_me/24.png',
            '/api/og/recap/user_me/2024'
        ])
            expect((await app.request(path)).status, path).toBe(404);
    });
});

describe('card renderer cache', () => {
    const data = {
        host: 'x.example',
        username: 'joe',
        avatarVersion: null,
        avatarIcon: null,
        playing: false,
        total: 1,
        finished: 0,
        backlog: 1,
        covers: ['co1']
    };

    it('renders a key once, even when asked concurrently, and reuses it afterwards', async () => {
        const loadAll = vi.fn(async () => new Map([['co1', null]]));
        const cards = createCardRenderer({ covers: { loadAll } });
        const [a, b] = await Promise.all([
            cards.render('k', { data, avatar: null }),
            cards.render('k', { data, avatar: null })
        ]);
        await cards.render('k', { data, avatar: null });
        expect(a).toBe(b);
        expect(loadAll).toHaveBeenCalledTimes(1);
        await cards.render('other', { data, avatar: null });
        expect(loadAll).toHaveBeenCalledTimes(2);
    });

    it('evicts the least recently used entry', () => {
        const lru = new LruCache<string, number>(2);
        lru.set('a', 1);
        lru.set('b', 2);
        lru.get('a');
        lru.set('c', 3);
        expect([lru.get('a'), lru.get('b'), lru.get('c')]).toEqual([1, undefined, 3]);
        expect(lru.size).toBe(2);
    });

    it('fetches each cover once and remembers it, but not failures', async () => {
        const fetchImpl = coverFetch();
        const loader = createCoverLoader(fetchImpl);
        const first = await loader.loadAll(['a', 'a', 'b']);
        await loader.loadAll(['a', 'b']);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(first.get('a')).toMatch(/^data:image\/jpeg;base64,/);

        const failing = coverFetch(500);
        const retry = createCoverLoader(failing);
        expect((await retry.loadAll(['a'])).get('a')).toBeNull();
        await retry.loadAll(['a']);
        expect(failing).toHaveBeenCalledTimes(2);
    });
});

describe('link preview tags', () => {
    const HTML =
        '<html><head><title>GameQueue</title></head><body><div id="root"></div></body></html>';

    async function page(path: string) {
        const { db, config, call, add } = await setup();
        const web = new Hono().get(
            '*',
            spaFallback({ db, config }, async () => HTML)
        );
        const get = async (p: string) => (await web.request(p)).text();
        return { get, call, add, text: await get(path), db, config };
    }
    const content = (html: string, key: string) =>
        new RegExp(`(?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

    it('adds og and twitter tags to a public profile', async () => {
        const { text } = await page('/u/user_me');
        expect(content(text, 'og:title')).toBe("user_me's Profile | GameQueue");
        expect(content(text, 'twitter:card')).toBe('summary_large_image');
        expect(content(text, 'og:url')).toBe('https://games.example/u/user_me');
        expect(content(text, 'og:image')).toMatch(
            /^https:\/\/games\.example\/api\/og\/profile\/user_me\.png\?v=[0-9a-f]{12}$/
        );
        expect(content(text, 'og:image:width')).toBe('1200');
        expect(text).toContain("<title>user_me's Profile | GameQueue</title>");
    });

    it('changes the image URL when what the card shows changes', async () => {
        const { get, add } = await page('/u/user_me');
        const before = content(await get('/u/user_me'), 'og:image');
        await add(1, [PC.id]);
        const after = content(await get('/u/user_me'), 'og:image');
        expect(after).not.toBe(before);
        expect(content(await get('/u/user_me'), 'og:image')).toBe(after);
    });

    it('names the year on the recap, whether or not the URL does', async () => {
        const { get } = await page('/u/user_me/recap');
        const thisYear = new Date().getUTCFullYear();
        const implicit = await get('/u/user_me/recap');
        expect(content(implicit, 'og:image')).toContain(`/recap/user_me/${thisYear}.png`);
        const explicit = await get('/u/user_me/recap/2022');
        expect(content(explicit, 'og:title')).toBe("user_me's 2022 in games | GameQueue");
        expect(content(explicit, 'og:url')).toBe('https://games.example/u/user_me/recap/2022');
    });

    it('leaves every other page, and unknown users, as the plain app shell', async () => {
        const { get } = await page('/');
        for (const path of [
            '/collection',
            '/u/nobody',
            '/u/user_me/stats',
            '/u/%E0%A4%A',
            '/u/user_me/recap/1'
        ])
            expect(await get(path), path).toBe(HTML);
    });

    it('escapes what it inserts', () => {
        const html = injectMeta(HTML, {
            title: 'a "b" <c> & d',
            description: '"><script>x</script>',
            url: 'https://x/u/a',
            image: 'https://x/i.png',
            imageAlt: 'alt'
        });
        expect(html).not.toContain('<script>');
        expect(html).toContain('content="a &quot;b&quot; &lt;c&gt; &amp; d"');
        expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('</head>'));
    });

    it('does not break the page when building tags fails', async () => {
        const { db, config } = await setup();
        const broken = new Hono().get(
            '*',
            spaFallback({ db, config: { ...config, publicUrl: 'not a url' } }, async () => HTML)
        );
        const res = await broken.request('/u/user_me');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe(HTML);
    });
});

describe('grid and tier list share cards', () => {
    async function social(fetchImpl = coverFetch()) {
        const s = await setup(fetchImpl);
        const grid = (await s.call('/grids', 'POST', { title: 'Best of', cols: 3, rows: 2 })).grid;
        await s.call(`/grids/${grid.id}/cells/0`, 'PUT', { label: 'A', igdbId: 1 });
        await s.call(`/grids/${grid.id}/cells/1`, 'PUT', { igdbId: 2 });
        const tl = (await s.call('/tier-lists', 'POST', { title: 'Ranked' })).tierList;
        await s.call(`/tier-lists/${tl.id}/items`, 'POST', { igdbId: 1, tierId: tl.tiers[0].id });
        await s.call(`/tier-lists/${tl.id}/items`, 'POST', { igdbId: 2, tierId: tl.tiers[2].id });
        await s.call(`/tier-lists/${tl.id}/items`, 'POST', { igdbId: 3 }); // unranked: not on the card
        return { ...s, grid, tl };
    }
    const isPng = async (res: Response) =>
        expect([...(await bytes(res)).subarray(0, 4)]).toEqual(PNG_MAGIC);

    it('serves the grid and tier list cards as PNGs without logging in', async () => {
        const { app, grid, tl, fetchImpl } = await social();
        const g = await app.request(`/api/og/grid/user_me/${grid.id}.png`);
        expect(g.status).toBe(200);
        expect(g.headers.get('content-type')).toBe('image/png');
        await isPng(g);
        const t = await app.request(`/api/og/tiers/user_me/${tl.id}.png`);
        expect(t.status).toBe(200);
        await isPng(t);
        // dense cards use the small cover size, not the big one the profile card uses
        const urls = fetchImpl.mock.calls.map((c) => String((c as unknown[])[0]));
        expect(urls.length).toBeGreaterThan(0);
        expect(urls.every((u) => u.includes('t_cover_small_2x'))).toBe(true);
    });

    it('still draws when covers cannot be fetched, and for an empty grid or tier list', async () => {
        const { app, grid, tl, call } = await social(coverFetch(404));
        await isPng(await app.request(`/api/og/grid/user_me/${grid.id}.png`));
        await isPng(await app.request(`/api/og/tiers/user_me/${tl.id}.png`));
        const empty = (await call('/grids', 'POST', { title: 'Empty' })).grid;
        const none = (await call('/tier-lists', 'POST', { title: 'None' })).tierList;
        await isPng(await app.request(`/api/og/grid/user_me/${empty.id}.png`));
        await isPng(await app.request(`/api/og/tiers/user_me/${none.id}.png`));
    });

    it('404s for other people’s ids, unknown ids and URLs we never hand out', async () => {
        const { app, grid } = await social();
        for (const path of [
            `/api/og/grid/nobody/${grid.id}.png`,
            '/api/og/grid/user_me/999.png',
            `/api/og/grid/user_me/${grid.id}`, // no .png
            '/api/og/grid/user_me/abc.png',
            '/api/og/tiers/user_me/999.png',
            '/api/og/tiers/Bad%20Name/1.png'
        ])
            expect((await app.request(path)).status, path).toBe(404);
    });

    it('draws only what the fonts can: an exotic title falls back, a normal one is kept', async () => {
        const { db } = await social();
        const { getGridCardData, getTierCardData } = await import('../src/services/og.js');
        const { grids, tierLists } = await import('../src/db/schema.js');
        expect(getGridCardData(db, 'user_me', 1, 'x.example').title).toBe('Best of');
        db.update(grids).set({ title: '日本語のタイトル' }).run();
        db.update(tierLists).set({ title: 'Café ranking' }).run();
        const g = getGridCardData(db, 'user_me', 1, 'x.example');
        expect(g.title).toBeNull();
        expect(g).toMatchObject({ cols: 3, rows: 2, filled: 2, covers: ['co1', 'co2'] });
        expect(g.cells.map((c) => c?.cover ?? null)).toEqual([
            'co1',
            'co2',
            null,
            null,
            null,
            null
        ]);
        const t = getTierCardData(db, 'user_me', 1, 'x.example');
        expect(t.title).toBe('Café ranking');
        // the unranked game and the empty tiers are not on the card; best tier first
        expect(t.ranked).toBe(2);
        expect(t.tiers.map((x) => [x.name, x.total])).toEqual([
            ['S', 1],
            ['B', 1]
        ]);
        expect(t.covers).toEqual(['co1', 'co2']);
    });

    it('limits the tiers drawn and the covers per tier', async () => {
        const { tierCardData } = await import('../src/services/og.js');
        const game = (id: number) => ({ igdbId: id, game: { coverImageId: `co${id}` } }) as never;
        const tier = (id: number, n: number) => ({
            id,
            name: `T${id}`,
            color: 'red' as const,
            items: Array.from({ length: n }, (_, i) => game(id * 100 + i))
        });
        const data = tierCardData(
            {
                id: 1,
                username: 'joe',
                title: 'x',
                description: '',
                unranked: [],
                createdAt: 0,
                updatedAt: 0,
                tiers: [1, 2, 3, 4, 5, 6, 7].map((i) => tier(i, 9))
            },
            { version: null, icon: null },
            'x.example'
        );
        expect(data.tiers).toHaveLength(5);
        expect(data.tiers[0]!.covers).toHaveLength(6);
        expect(data.tiers[0]!.total).toBe(9);
        expect(data.ranked).toBe(63);
        expect(data.covers.length).toBeLessThanOrEqual(30);
    });

    it('isDrawable accepts latin text and rejects what the bundled fonts lack', async () => {
        const { isDrawable, drawable } = await import('../src/og/text.js');
        for (const ok of ['Best of 2026', 'Café', "Joe's “picks” – 2026…", 'S', ''])
            expect(isDrawable(ok), ok).toBe(true);
        for (const bad of ['日本語', 'Игры', 'Best 🎮', 'عربي'])
            expect(isDrawable(bad), bad).toBe(false);
        expect(drawable('   ')).toBeNull();
        expect(drawable('日本')).toBeNull();
        expect(drawable('Hades')).toBe('Hades');
    });

    describe('link preview tags', () => {
        const HTML = '<html><head><title>GameQueue</title></head><body></body></html>';
        const content = (html: string, key: string) =>
            new RegExp(`(?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

        async function pages() {
            const s = await social();
            const web = new Hono().get(
                '*',
                spaFallback({ db: s.db, config: s.config }, async () => HTML)
            );
            return { ...s, get: async (p: string) => (await web.request(p)).text() };
        }

        it('adds tags with a card URL to a public grid and tier list', async () => {
            const { get, grid, tl } = await pages();
            const g = await get(`/u/user_me/grids/${grid.id}`);
            expect(content(g, 'og:title')).toBe('Best of by user_me | GameQueue');
            expect(content(g, 'og:description')).toBe(
                'A 3 by 2 grid of games by user_me, 2 of 6 filled.'
            );
            expect(content(g, 'og:url')).toBe(`https://games.example/u/user_me/grids/${grid.id}`);
            expect(content(g, 'og:image')).toMatch(
                new RegExp(
                    `^https://games\\.example/api/og/grid/user_me/${grid.id}\\.png\\?v=[0-9a-f]{12}$`
                )
            );
            expect(content(g, 'twitter:card')).toBe('summary_large_image');
            const t = await get(`/u/user_me/tiers/${tl.id}`);
            expect(content(t, 'og:title')).toBe('Ranked by user_me | GameQueue');
            expect(content(t, 'og:description')).toBe(
                'A tier list by user_me: 2 games ranked across 2 tiers.'
            );
            expect(content(t, 'og:image')).toMatch(
                new RegExp(
                    `^https://games\\.example/api/og/tiers/user_me/${tl.id}\\.png\\?v=[0-9a-f]{12}$`
                )
            );
        });

        it('prefers the owner’s own description, and changes the image URL when the content changes', async () => {
            const { get, grid, call } = await pages();
            await call(`/grids/${grid.id}`, 'PATCH', { description: 'My top picks <3' });
            const before = await get(`/u/user_me/grids/${grid.id}`);
            expect(content(before, 'og:description')).toBe('My top picks &lt;3');
            await call(`/grids/${grid.id}/cells/5`, 'PUT', { igdbId: 3 });
            const after = await get(`/u/user_me/grids/${grid.id}`);
            expect(content(after, 'og:image')).not.toBe(content(before, 'og:image'));
            // the same content gives the same URL
            expect(content(await get(`/u/user_me/grids/${grid.id}`), 'og:image')).toBe(
                content(after, 'og:image')
            );
        });

        it('leaves unknown ids and other people’s pages as the plain app shell', async () => {
            const { get, grid } = await pages();
            for (const path of [
                '/u/user_me/grids/999',
                '/u/nobody/grids/1',
                `/u/other/grids/${grid.id}`,
                '/u/user_me/tiers/999',
                '/u/user_me/grids/abc',
                '/u/user_me/grids/0'
            ])
                expect(await get(path), path).toBe(HTML);
        });
    });
});
