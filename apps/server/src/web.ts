import { serveStatic } from '@hono/node-server/serve-static';
import type { Handler, Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { injectMeta } from './og/meta.js';
import { pageSeo, robotsTxt } from './seo.js';
import { reportError } from './services/error-log.js';

/**
 * Serves `index.html` for every route the API doesn't own (the SPA fallback). Landing, profile and
 * recap pages get description, canonical and link-preview tags (`og:image` ...) added, since crawlers
 * don't run the app. Indexing rules (`X-Robots-Tag`, a 404 for unknown users) come from `pageSeo`. A
 * failure while building them is recorded and the plain page is served instead, never an error.
 */
export function spaFallback(
    { db, config }: { db: Db; config: Config },
    readIndex: () => Promise<string>
): Handler {
    return async (c) => {
        const html = await readIndex();
        try {
            const seo = pageSeo(db, config, c.req.path);
            if (seo.noindex) c.header('X-Robots-Tag', 'noindex');
            c.status(seo.status);
            return c.html(seo.meta ? injectMeta(html, seo.meta) : html);
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
    const fallback = spaFallback(deps, () => readFile(resolve(webDist, 'index.html'), 'utf8'));
    app.get('/robots.txt', (c) => c.text(robotsTxt()));
    // Before the static handler, which would otherwise serve index.html for `/` without any tags
    app.get('/', fallback);
    app.use('/*', serveStatic({ root }));
    app.get('*', fallback);
}
