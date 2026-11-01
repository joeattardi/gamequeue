import { Hono, type Context } from 'hono';
import { readFile } from 'node:fs/promises';
import {
    IMAGE_UPLOAD_TYPES,
    createPostSchema,
    patchPostSchema,
    setVisibilitySchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { parseId, validate } from '../http.js';
import {
    addImage,
    createPost,
    deleteImage,
    deletePost,
    getJournal,
    listPosts,
    ownImageFile,
    patchPost,
    setVisibility,
    sharedImageFile
} from '../services/journal.js';
import { imageFilesOf, imagePath, removeUnreferencedFiles } from '../services/screenshots.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/** Path of the raw-bytes upload route; `app.ts` gives it its own body limit and content types. */
export const IMAGE_UPLOAD_PATH = /^\/api\/posts\/\d+\/images$/;

/** An image as a response. `no-cache` makes the browser ask every time, so a journal set back to private stops serving at once. */
async function sendImage(c: Context, deps: AppDeps, fileName: string) {
    const etag = `"${fileName.replace(/\.webp$/, '')}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304, { ETag: etag });
    let data: Buffer;
    try {
        data = await readFile(imagePath(deps.config, fileName));
    } catch {
        throw new HttpError(404, 'Not found');
    }
    return c.body(new Uint8Array(data), 200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-cache',
        ETag: etag
    });
}

/** Posts of one playthrough, and its sharing; mounted at /api/playthroughs next to the other playthrough routes. */
export function addJournalRoutes(r: Hono<{ Variables: AuthVars }>, { db }: AppDeps) {
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    r.get('/:id/posts', (c) =>
        c.json({ posts: listPosts(db, uid(c), parseId(c.req.param('id'))) })
    );
    r.post('/:id/posts', async (c) =>
        c.json(
            {
                post: createPost(
                    db,
                    uid(c),
                    parseId(c.req.param('id')),
                    validate(createPostSchema, await body(c))
                )
            },
            201
        )
    );
    r.put('/:id/visibility', async (c) =>
        c.json(
            setVisibility(
                db,
                uid(c),
                parseId(c.req.param('id')),
                validate(setVisibilitySchema, await body(c)).visibility
            )
        )
    );
}

/** The owner's own posts and images: mounted at /api/posts. */
export function postRoutes(deps: AppDeps) {
    const { db, config } = deps;
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;

    r.patch('/:id', async (c) =>
        c.json({
            post: patchPost(
                db,
                uid(c),
                parseId(c.req.param('id')),
                validate(patchPostSchema, await body(c))
            )
        })
    );
    r.delete('/:id', (c) => {
        const id = parseId(c.req.param('id'));
        const files = imageFilesOf(db, { postId: id });
        deletePost(db, uid(c), id);
        removeUnreferencedFiles(db, config, files);
        return c.json({ ok: true });
    });
    // One picture per request, sent as the raw file (not JSON): see `IMAGE_UPLOAD_PATH` in app.ts
    r.post('/:id/images', async (c) => {
        const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
        if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(type))
            throw new HttpError(415, 'Only JPEG, PNG and WebP images can be uploaded');
        const upload = Buffer.from(await c.req.arrayBuffer());
        return c.json({
            post: await addImage(db, config, uid(c), parseId(c.req.param('id')), upload)
        });
    });
    r.get('/images/:imageId', async (c) =>
        sendImage(c, deps, ownImageFile(db, uid(c), parseId(c.req.param('imageId'))))
    );
    r.delete('/images/:imageId', (c) => {
        const id = parseId(c.req.param('imageId'));
        const files = imageFilesOf(db, { imageId: id });
        deleteImage(db, uid(c), id);
        removeUnreferencedFiles(db, config, files);
        return c.json({ ok: true });
    });
    return r;
}

/** Shared journals, readable without logging in: mounted at /api/journals. */
export function journalRoutes(deps: AppDeps) {
    const { db } = deps;
    const r = new Hono();
    r.get('/:slug', (c) => c.json({ journal: getJournal(db, c.req.param('slug')) }));
    r.get('/:slug/images/:imageId', async (c) =>
        sendImage(
            c,
            deps,
            sharedImageFile(db, c.req.param('slug'), parseId(c.req.param('imageId')))
        )
    );
    return r;
}
