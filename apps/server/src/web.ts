import { serveStatic } from '@hono/node-server/serve-static';
import type { Handler, Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { injectMeta, pageMeta } from './og/meta.js';
import { reportError } from './services/error-log.js';

/**
 * Serves `index.html` for every route the API doesn't own (the SPA fallback). Public profile and recap
 * pages get link-preview tags (`og:image` ...) added, since crawlers don't run the app. A failure while
 * building them is recorded and the plain page is served instead, never an error.
 */
export function spaFallback(
    { db, config }: { db: Db; config: Config },
    readIndex: () => Promise<string>
): Handler {
    return async (c) => {
        const html = await readIndex();
        try {
            const meta = pageMeta(db, config, c.req.path);
            return c.html(meta ? injectMeta(html, meta) : html);
        } catch (err) {
            reportError(db, 'server_500', err, {
                status: 500,
                route: `${c.req.method} ${c.req.path}`
            });
            return c.html(html);
        }
    };
}

/** Production: the built web app from the same process and port, with the SPA fallback. */
export function mountWeb(app: Hono<any>, deps: { db: Db; config: Config }, webDist: string) {
    const root = webDist.replace(process.cwd() + '/', './');
    app.use('/*', serveStatic({ root }));
    app.get(
        '*',
        spaFallback(deps, () => readFile(resolve(webDist, 'index.html'), 'utf8'))
    );
}
