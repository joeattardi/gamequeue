import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { playthroughPosts, postImages, users } from '../src/db/schema.js';
import { cleanupScreenshots } from '../src/services/screenshots.js';
import { mountWeb } from '../src/web.js';
import { PC, setupApi } from './api.js';

const USER = 'user_me';

/** A noisy picture, so it doesn't compress to nothing; JPEG carries an EXIF orientation and GPS-ish text. */
async function picture(format: 'jpeg' | 'png' | 'webp' | 'gif', width = 64, height = 48) {
    const noise = Buffer.alloc(width * height * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919 + (i >> 3)) & 255;
    const img = sharp(noise, { raw: { width, height, channels: 3 } });
    if (format === 'jpeg')
        return img
            .withExif({ IFD0: { Copyright: 'secret-copyright', ImageDescription: 'secret-place' } })
            .jpeg()
            .toBuffer();
    return img[format]().toBuffer();
}

async function setup() {
    const s = await setupApi();
    const hades = await s.add(1);
    const open = (await s.call(`/entries/${hades.id}/start`, 'POST', { platformId: PC.id })).entry
        .openPlaythrough as { id: number };
    const post = async (body: unknown, who = s.cookie, pid = open.id) =>
        s.call(`/playthroughs/${pid}/posts`, 'POST', body, who);
    const upload = (
        postId: number,
        data: Buffer | Uint8Array,
        type = 'image/png',
        who = s.cookie
    ) =>
        s.app.request(`/api/posts/${postId}/images`, {
            method: 'POST',
            body: data as BodyInit,
            headers: { origin: 'http://localhost', cookie: who, 'content-type': type }
        });
    const files = () =>
        existsSync(s.config.screenshotsPath) ? readdirSync(s.config.screenshotsPath) : [];
    /** A screenshot post with one stored picture */
    const shot = async (who = s.cookie, pid = open.id, data?: Buffer) => {
        const created = (await post({ kind: 'screenshot', body: 'cap' }, who, pid)).post;
        const res = await upload(created.id, data ?? (await picture('png')), 'image/png', who);
        return { postId: created.id as number, res, body: await res.json() };
    };
    return { ...s, hades, open, post, upload, files, shot };
}

describe('journal posts', () => {
    it('adds, edits and deletes notes, hours and screenshots on an open playthrough', async () => {
        const { call, post, open, hades } = await setup();
        const note = (await post({ kind: 'note', body: 'Tough boss', spoiler: true })).post;
        expect(note).toMatchObject({ kind: 'note', body: 'Tough boss', spoiler: true, images: [] });
        const hours = (await post({ kind: 'hours', minutes: 90, body: 'Late night' })).post;
        await post({ kind: 'hours', minutes: 30 });
        expect(hours).toMatchObject({ kind: 'hours', minutes: 90 });

        const edited = await call(`/posts/${note.id}`, 'PATCH', {
            body: 'Beat him',
            spoiler: false
        });
        expect(edited.post).toMatchObject({ body: 'Beat him', spoiler: false });
        expect((await call(`/posts/${hours.id}`, 'PATCH', { minutes: 120 })).post.minutes).toBe(
            120
        );
        // minutes only belong to hours posts; a note can't be emptied
        expect((await call(`/posts/${note.id}`, 'PATCH', { minutes: 5 })).status).toBe(400);
        expect((await call(`/posts/${note.id}`, 'PATCH', { body: '' })).status).toBe(400);
        expect((await post({ kind: 'note', body: '  ' })).status).toBe(400);
        expect((await post({ kind: 'hours', minutes: 0 })).status).toBe(400);

        // newest first, and the hours total is on the playthrough
        const list = (await call(`/playthroughs/${open.id}/posts`)).posts;
        expect(list.map((p: any) => p.kind)).toEqual(['hours', 'hours', 'note']);
        const history = (await call(`/entries/${hades.id}/playthroughs`)).playthroughs;
        expect(history[0].loggedMinutes).toBe(150);
        expect((await call(`/entries/${hades.id}`)).entry.openPlaythrough.loggedMinutes).toBe(150);

        expect((await call(`/posts/${hours.id}`, 'DELETE')).status).toBe(200);
        expect((await call(`/playthroughs/${open.id}/posts`)).posts).toHaveLength(2);
        expect(
            (await call(`/entries/${hades.id}/playthroughs`)).playthroughs[0].loggedMinutes
        ).toBe(30);
    });

    it('is invisible and read-only to other users (404)', async () => {
        const { call, post, secondUser, open, shot } = await setup();
        const other = await secondUser();
        const note = (await post({ kind: 'note', body: 'mine' })).post;
        const { postId, body } = await shot();
        const imageId = body.post.images[0].id;
        expect((await call(`/playthroughs/${open.id}/posts`, 'GET', undefined, other)).status).toBe(
            404
        );
        expect((await post({ kind: 'note', body: 'hi' }, other)).status).toBe(404);
        expect((await call(`/posts/${note.id}`, 'PATCH', { body: 'x' }, other)).status).toBe(404);
        expect((await call(`/posts/${note.id}`, 'DELETE', undefined, other)).status).toBe(404);
        expect(
            (
                await call(
                    `/playthroughs/${open.id}/visibility`,
                    'PUT',
                    { visibility: 'public' },
                    other
                )
            ).status
        ).toBe(404);
        expect((await call(`/posts/images/${imageId}`, 'DELETE', undefined, other)).status).toBe(
            404
        );
        const stolen = await call(`/posts/images/${imageId}`, 'GET', undefined, other);
        expect(stolen.status).toBe(404);
        expect(postId).toBeGreaterThan(0);
        // nothing changed
        expect(
            (await call(`/playthroughs/${open.id}/posts`)).posts.map((p: any) => p.body)
        ).toContain('mine');
    });

    it('stores final thoughts, time and rating when finishing, and they show on the journal', async () => {
        const { call, post, hades, open } = await setup();
        await post({ kind: 'hours', minutes: 600 });
        const done = await call(`/entries/${hades.id}/finish`, 'POST', {
            rating: 5,
            playtimeMinutes: 640,
            finalThoughts: 'A near perfect run.'
        });
        expect(done.entry.status).toBe('finished');
        const p = (await call(`/entries/${hades.id}/playthroughs`)).playthroughs[0];
        expect(p).toMatchObject({
            rating: 5,
            playtimeMinutes: 640,
            finalThoughts: 'A near perfect run.',
            loggedMinutes: 600
        });
        const { shareSlug } = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'unlisted'
        });
        const journal = (await call(`/journals/${shareSlug}`)).journal;
        expect(journal).toMatchObject({
            finalThoughts: 'A near perfect run.',
            outcome: 'finished',
            rating: 5,
            playtimeMinutes: 640,
            endedOn: new Date().toISOString().slice(0, 10),
            game: { name: 'Hades' },
            owner: { username: USER }
        });
        // final thoughts can be edited later
        await call(`/playthroughs/${open.id}`, 'PATCH', { finalThoughts: 'Even better.' });
        expect((await call(`/journals/${shareSlug}`)).journal.finalThoughts).toBe('Even better.');
    });

    it('reports unknown dates as null and lists posts newest first', async () => {
        const { call, add, post } = await setup();
        const celeste = await add(2);
        await call(`/entries/${celeste.id}/playthroughs`, 'POST', { outcome: 'finished' });
        const pid = (await call(`/entries/${celeste.id}/playthroughs`)).playthroughs[0].id;
        await post({ kind: 'note', body: 'first' }, undefined, pid);
        await post({ kind: 'note', body: 'second' }, undefined, pid);
        const { shareSlug } = await call(`/playthroughs/${pid}/visibility`, 'PUT', {
            visibility: 'unlisted'
        });
        const j = (await call(`/journals/${shareSlug}`)).journal;
        expect(j).toMatchObject({ startedOn: null, endedOn: null, outcome: 'finished' });
        expect(j.posts.map((p: any) => p.body)).toEqual(['second', 'first']);
    });

    it('never includes private entry notes in a journal', async () => {
        const { call, post, hades, open } = await setup();
        await call(`/entries/${hades.id}/notes`, 'POST', { body: 'PRIVATE-ENTRY-NOTE' });
        await call(`/entries/${hades.id}/notes`, 'POST', {
            body: 'PUBLIC-ENTRY-NOTE',
            public: true
        });
        await post({ kind: 'note', body: 'journal text' });
        const { shareSlug } = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'public'
        });
        const raw = JSON.stringify(await call(`/journals/${shareSlug}`));
        expect(raw).toContain('journal text');
        expect(raw).not.toContain('ENTRY-NOTE');
    });
});

describe('journal sharing', () => {
    it('is private by default; unlisted works by link only; public is on the profile', async () => {
        const { app, call, post, open, secondUser } = await setup();
        await post({ kind: 'note', body: 'hello' });
        const playthrough = async () =>
            (await call(`/entries/${(await call('/entries')).entries[0].id}/playthroughs`))
                .playthroughs[0];
        expect(await playthrough()).toMatchObject({ visibility: 'private', shareSlug: null });
        const profile = async () =>
            (await (await app.request(`/api/profiles/${USER}/journals`)).json()).journals;
        expect(await profile()).toEqual([]);

        const unlisted = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'unlisted'
        });
        expect(unlisted.shareSlug).toMatch(/^[A-Za-z0-9_-]{22}$/); // 128 bits, base64url
        // anyone with the link, no login
        const anon = await app.request(`/api/journals/${unlisted.shareSlug}`);
        expect(anon.status).toBe(200);
        expect(
            (await call(`/journals/${unlisted.shareSlug}`, 'GET', undefined, await secondUser()))
                .status
        ).toBe(200);
        expect(await profile()).toEqual([]); // not listed

        const pub = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'public'
        });
        expect(pub.shareSlug).toBe(unlisted.shareSlug); // the same link
        expect(await profile()).toMatchObject([
            { slug: pub.shareSlug, game: { name: 'Hades' }, posts: 1 }
        ]);

        expect(
            (await call(`/playthroughs/${open.id}/visibility`, 'PUT', { visibility: 'nope' }))
                .status
        ).toBe(400);
    });

    it('cuts off the page and its image URLs the moment it goes back to private', async () => {
        const { app, cookie, call, shot, open } = await setup();
        const { body } = await shot();
        const imageId = body.post.images[0].id;
        const { shareSlug } = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'public'
        });
        const image = () => app.request(`/api/journals/${shareSlug}/images/${imageId}`);
        const ok = await image();
        expect(ok.status).toBe(200);
        expect(ok.headers.get('content-type')).toBe('image/webp');
        expect(ok.headers.get('cache-control')).toContain('no-cache');

        await call(`/playthroughs/${open.id}/visibility`, 'PUT', { visibility: 'private' });
        expect((await app.request(`/api/journals/${shareSlug}`)).status).toBe(404);
        expect((await image()).status).toBe(404);
        // and a new share gets a new link; the old one stays dead
        const again = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'unlisted'
        });
        expect(again.shareSlug).not.toBe(shareSlug);
        expect((await app.request(`/api/journals/${shareSlug}`)).status).toBe(404);
        // the owner can always see their own picture
        const own = await app.request(`/api/posts/images/${imageId}`, { headers: { cookie } });
        expect(own.status).toBe(200);
    });

    it('does not serve an image through another playthrough’s link', async () => {
        const { app, call, shot, add, post } = await setup();
        const { body } = await shot();
        const imageId = body.post.images[0].id;
        const celeste = await add(2);
        const pid =
            (await call(`/entries/${celeste.id}/playthroughs`, 'POST', { outcome: 'finished' }))
                .entry && (await call(`/entries/${celeste.id}/playthroughs`)).playthroughs[0].id;
        await post({ kind: 'note', body: 'x' }, undefined, pid);
        const { shareSlug } = await call(`/playthroughs/${pid}/visibility`, 'PUT', {
            visibility: 'public'
        });
        expect((await app.request(`/api/journals/${shareSlug}/images/${imageId}`)).status).toBe(
            404
        );
    });

    it('hides the journal of an unconfirmed account and of a deleted playthrough', async () => {
        const { app, db, call, open, hades } = await setup();
        const { shareSlug } = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'public'
        });
        db.update(users).set({ emailVerifiedAt: null }).where(eq(users.username, USER)).run();
        expect((await app.request(`/api/journals/${shareSlug}`)).status).toBe(404);
        expect((await app.request(`/api/profiles/${USER}/journals`)).status).toBe(404);
        db.update(users).set({ emailVerifiedAt: Date.now() }).where(eq(users.username, USER)).run();
        expect((await app.request(`/api/journals/${shareSlug}`)).status).toBe(200);
        await call(`/playthroughs/${open.id}`, 'DELETE');
        expect((await app.request(`/api/journals/${shareSlug}`)).status).toBe(404);
        expect(hades.id).toBeGreaterThan(0);
    });
});

describe('screenshot uploads', () => {
    it('re-encodes to WebP, strips metadata and limits the size', async () => {
        const { upload, post, files } = await setup();
        const created = (await post({ kind: 'screenshot' })).post;
        const big = await picture('jpeg', 2400, 1200);
        expect(big.includes(Buffer.from('secret-place'))).toBe(true); // the original carries metadata
        const res = await upload(created.id, big, 'image/jpeg');
        expect(res.status).toBe(200);
        const image = (await res.json()).post.images[0];
        expect(image).toMatchObject({ width: 1920, height: 960 });

        expect(files()[0]).toMatch(/^[0-9a-f]{64}\.webp$/);
    });

    it('stores a clean WebP file with no EXIF', async () => {
        const { upload, post, files, config } = await setup();
        const created = (await post({ kind: 'screenshot' })).post;
        await upload(created.id, await picture('jpeg', 300, 200), 'image/jpeg');
        const data = (await import('node:fs')).readFileSync(
            join(config.screenshotsPath, files()[0]!)
        );
        const meta = await sharp(data).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.exif).toBeUndefined();
        expect(data.includes(Buffer.from('secret-place'))).toBe(false);
        expect(data.includes(Buffer.from('secret-copyright'))).toBe(false);
        // JPEG, PNG and WebP are all accepted
        const second = (await post({ kind: 'screenshot' })).post;
        expect((await upload(second.id, await picture('png'), 'image/png')).status).toBe(200);
        expect((await upload(second.id, await picture('webp'), 'image/webp')).status).toBe(200);
    });

    it('refuses wrong types, fake images, oversized files, empty bodies and a seventh image', async () => {
        const { upload, post, call, open } = await setup();
        const created = (await post({ kind: 'screenshot' })).post;
        const gif = await upload(created.id, await picture('gif'), 'image/png');
        expect(gif.status).toBe(415);
        expect((await gif.json()).error).toMatch(/JPEG, PNG and WebP/);
        expect((await upload(created.id, Buffer.from('not an image'), 'image/png')).status).toBe(
            415
        );
        expect((await upload(created.id, await picture('png'), 'image/gif')).status).toBe(415);
        expect((await upload(created.id, await picture('png'), 'application/json')).status).toBe(
            415
        );
        expect((await upload(created.id, Buffer.alloc(0))).status).toBe(400);
        const huge = await upload(created.id, Buffer.alloc(8 * 1024 * 1024 + 1, 1));
        expect(huge.status).toBe(413);
        expect((await huge.json()).error).toMatch(/8 MB/);

        for (let i = 0; i < 6; i++) {
            const res = await upload(created.id, await picture('png', 32 + i, 32));
            expect(res.status).toBe(200);
        }
        const seventh = await upload(created.id, await picture('png', 99, 32));
        expect(seventh.status).toBe(400);
        expect((await seventh.json()).error).toMatch(/at most 6/);

        // only screenshot posts hold images
        const note = (await post({ kind: 'note', body: 'x' })).post;
        expect((await upload(note.id, await picture('png'))).status).toBe(400);
        expect(open.id).toBeGreaterThan(0);
        expect(
            (await call(`/playthroughs/${open.id}/posts`)).posts.find(
                (p: any) => p.id === created.id
            ).images
        ).toHaveLength(6);
    });

    it('keeps the Origin check: a foreign origin is refused', async () => {
        const { app, post, cookie, files } = await setup();
        const created = (await post({ kind: 'screenshot' })).post;
        const res = await app.request(`/api/posts/${created.id}/images`, {
            method: 'POST',
            body: (await picture('png')) as unknown as BodyInit,
            headers: { origin: 'https://evil.example', cookie, 'content-type': 'image/png' }
        });
        expect(res.status).toBe(403);
        expect(files()).toEqual([]);
    });

    it('accepts image content types only on the upload route', async () => {
        const { app, cookie, open } = await setup();
        const res = await app.request(`/api/playthroughs/${open.id}/posts`, {
            method: 'POST',
            body: (await picture('png')) as unknown as BodyInit,
            headers: { origin: 'http://localhost', cookie, 'content-type': 'image/png' }
        });
        expect(res.status).toBe(415);
    });

    it('refuses an upload past the storage cap, and a new cap applies at once', async () => {
        const { app, db, call, post, upload, secondUser } = await setup();
        const root = (await import('./helpers.js')).cookieFrom(
            await (
                await import('./helpers.js')
            ).register(app, 'root@example.com', undefined, 'root')
        );
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
        const admin = (path: string, method = 'GET', body?: unknown) =>
            call(`/admin${path}`, method, body, root);

        expect(await admin('/screenshots')).toMatchObject({ usedBytes: 0, capBytes: 1024 ** 3 });
        await admin('/screenshots/cap', 'PUT', { capBytes: 10 });
        const created = (await post({ kind: 'screenshot' })).post;
        const refused = await upload(created.id, await picture('png', 200, 200));
        expect(refused.status).toBe(507);
        expect((await refused.json()).error).toMatch(/storage is full/i);

        await admin('/screenshots/cap', 'PUT', { capBytes: 50 * 1024 });
        expect((await upload(created.id, await picture('png', 200, 200))).status).toBe(200);
        const after = await admin('/screenshots');
        expect(after.usedBytes).toBeGreaterThan(0);
        expect(after).toMatchObject({ capBytes: 50 * 1024, files: 1 });
        expect(after.freeDiskBytes === null || after.freeDiskBytes > 0).toBe(true);
        // the admin area is admin-only
        expect((await call('/admin/screenshots')).status).toBe(403);
        expect(
            (await call('/admin/screenshots/cap', 'PUT', { capBytes: 1 }, await secondUser()))
                .status
        ).toBe(403);
        expect((await admin('/screenshots/cap', 'PUT', { capBytes: -1 })).status).toBe(400);

        // a limit of 0 means no uploads at all, even of a picture that is already stored
        await admin('/screenshots/cap', 'PUT', { capBytes: 0 });
        const again = (await post({ kind: 'screenshot' })).post;
        expect((await upload(again.id, await picture('png', 200, 200))).status).toBe(507);
    });
});

describe('file clean-up', () => {
    it('deleting a post removes its file, but keeps one another post still uses', async () => {
        const { call, shot, files } = await setup();
        const same = await picture('png', 50, 50);
        const a = await shot(undefined, undefined, same);
        const b = await shot(undefined, undefined, same);
        expect(files()).toHaveLength(1); // the same picture is stored once
        await call(`/posts/${a.postId}`, 'DELETE');
        expect(files()).toHaveLength(1);
        await call(`/posts/${b.postId}`, 'DELETE');
        expect(files()).toEqual([]);
    });

    it('deleting one image, a playthrough, an entry or the account removes the files', async () => {
        const { call, shot, files, add, db } = await setup();
        const one = await shot(undefined, undefined, await picture('png', 40, 40));
        await call(`/posts/images/${one.body.post.images[0].id}`, 'DELETE');
        expect(files()).toEqual([]);
        expect(db.select().from(postImages).all()).toEqual([]);

        // a playthrough
        const celeste = await add(2);
        await call(`/entries/${celeste.id}/start`, 'POST', { platformId: PC.id });
        const pid = (await call(`/entries/${celeste.id}/playthroughs`)).playthroughs[0].id;
        await shot(undefined, pid, await picture('png', 41, 41));
        expect(files()).toHaveLength(1);
        await call(`/playthroughs/${pid}`, 'DELETE');
        expect(files()).toEqual([]);

        // an entry
        const knight = await add(3);
        await call(`/entries/${knight.id}/start`, 'POST', { platformId: PC.id });
        const kid = (await call(`/entries/${knight.id}/playthroughs`)).playthroughs[0].id;
        await shot(undefined, kid, await picture('png', 42, 42));
        expect(files()).toHaveLength(1);
        await call(`/entries/${knight.id}`, 'DELETE');
        expect(files()).toEqual([]);
        expect(
            db
                .select()
                .from(playthroughPosts)
                .all()
                .filter((p) => p.playthroughId === kid)
        ).toEqual([]);
    });

    it('deleting the account removes the files', async () => {
        const { call, shot, files } = await setup();
        await shot(undefined, undefined, await picture('png', 43, 43));
        expect(files()).toHaveLength(1);
        const res = await call('/account', 'DELETE', { password: 'correct horse battery' });
        expect(res.status).toBe(200);
        expect(files()).toEqual([]);
    });

    it('an admin deleting a user removes that user’s files', async () => {
        const { app, db, call, shot, files, userId } = await setup();
        await shot(undefined, undefined, await picture('png', 44, 44));
        const { cookieFrom, register } = await import('./helpers.js');
        const root = cookieFrom(await register(app, 'root@example.com', undefined, 'root'));
        db.update(users).set({ role: 'admin' }).where(eq(users.username, 'root')).run();
        expect((await call(`/admin/users/${userId}`, 'DELETE', undefined, root)).status).toBe(200);
        expect(files()).toEqual([]);
    });

    it('the daily job removes orphan files, dangling rows and abandoned empty posts', async () => {
        const { db, config, shot, post, files } = await setup();
        const kept = await shot(undefined, undefined, await picture('png', 45, 45));
        const keptFile = files()[0]!;

        mkdirSync(config.screenshotsPath, { recursive: true });
        const stray = join(config.screenshotsPath, `${'a'.repeat(64)}.webp`);
        const fresh = join(config.screenshotsPath, `${'b'.repeat(64)}.webp`);
        const foreign = join(config.screenshotsPath, 'README.txt');
        writeFileSync(stray, 'x');
        writeFileSync(fresh, 'x');
        writeFileSync(foreign, 'x');
        const old = new Date(Date.now() - 2 * 3600_000);
        utimesSync(stray, old, old);

        // a row whose file has vanished, and an empty screenshot post from long ago
        const lost = (await post({ kind: 'screenshot', body: 'lost' })).post;
        db.insert(postImages)
            .values({
                postId: lost.id,
                fileName: `${'c'.repeat(64)}.webp`,
                width: 1,
                height: 1,
                bytes: 1
            })
            .run();
        const empty = (await post({ kind: 'screenshot' })).post;
        const newer = (await post({ kind: 'screenshot' })).post;
        db.update(playthroughPosts)
            .set({ createdAt: Date.now() - 2 * 24 * 3600_000 })
            .where(eq(playthroughPosts.id, empty.id))
            .run();

        const result = cleanupScreenshots(db, config);
        expect(result).toEqual({ files: 1, imageRows: 1, emptyPosts: 1 });
        expect(existsSync(stray)).toBe(false);
        expect(existsSync(fresh)).toBe(true); // too young to be sure it is an orphan
        expect(existsSync(foreign)).toBe(true); // not one of ours
        expect(existsSync(join(config.screenshotsPath, keptFile))).toBe(true);
        const ids = db
            .select({ id: playthroughPosts.id })
            .from(playthroughPosts)
            .all()
            .map((p) => p.id);
        expect(ids).toContain(kept.postId);
        expect(ids).toContain(newer.id);
        expect(ids).not.toContain(empty.id);
        expect(db.select().from(postImages).all()).toHaveLength(1);
    });
});

describe('journal page for crawlers and link previews', () => {
    it('is noindex with a generic, note-free preview, and a 404 unless the link is live', async () => {
        const { db, config, call, post, open } = await setup();
        await post({ kind: 'note', body: 'SECRET-NOTE-TEXT' });
        const { shareSlug } = await call(`/playthroughs/${open.id}/visibility`, 'PUT', {
            visibility: 'unlisted'
        });
        const root = join(process.cwd(), 'node_modules', '.cache', 'journal-test-web');
        mkdirSync(root, { recursive: true });
        writeFileSync(
            join(root, 'index.html'),
            '<html><head><title>GameQueue</title></head><body></body></html>'
        );
        const web = new Hono();
        mountWeb(web, { db, config: { ...config, publicUrl: 'https://games.example' } }, root);

        const live = await web.request(`/p/${shareSlug}`);
        expect(live.status).toBe(200);
        expect(live.headers.get('x-robots-tag')).toBe('noindex');
        const html = await live.text();
        expect(html).toContain('A playthrough journal | GameQueue');
        expect(html).toContain(`https://games.example/p/${shareSlug}`);
        expect(html).not.toContain('SECRET-NOTE-TEXT');
        expect(html).not.toContain('Hades');
        expect(html).not.toContain('og:image');

        await call(`/playthroughs/${open.id}/visibility`, 'PUT', { visibility: 'private' });
        const dead = await web.request(`/p/${shareSlug}`);
        expect(dead.status).toBe(404);
        expect(dead.headers.get('x-robots-tag')).toBe('noindex');
        expect((await web.request('/p/nonsense')).status).toBe(404);
    });
});
