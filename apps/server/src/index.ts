import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { createIgdbClient } from './igdb/client.js';
import { reportError, pruneErrors } from './services/error-log.js';
import { backfillSeries } from './services/games.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const igdb =
    config.igdbClientId && config.igdbClientSecret
        ? createIgdbClient({
              clientId: config.igdbClientId,
              clientSecret: config.igdbClientSecret,
              onError: (f) =>
                  reportError(
                      db,
                      f.status === 429 ? 'igdb_429' : 'igdb_error',
                      new Error(f.message),
                      {
                          status: f.status,
                          context: { endpoint: f.endpoint, willRetry: f.willRetry }
                      }
                  )
          })
        : undefined;
if (!igdb)
    console.warn('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set: search and add-game are disabled.');
const app = createApp({ db, config, igdb });

// Production: serve the built web app from the same process/port, with SPA fallback.
const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
if (existsSync(webDist)) {
    const root = webDist.replace(process.cwd() + '/', './');
    app.use('/*', serveStatic({ root }));
    app.get('*', async (c) => c.html(await readFile(resolve(webDist, 'index.html'), 'utf8')));
}

// Anything that escapes a handler or a background job is recorded, then the process exits as Node
// would anyway; the container restarts it. The insert is synchronous, so it lands before the exit.
for (const event of ['uncaughtException', 'unhandledRejection'] as const)
    process.on(event, (err) => {
        reportError(db, 'process_crash', err, { context: { event } });
        process.exit(1);
    });

purgeExpiredSessions(db);
pruneErrors(db);
// Games cached before series were stored learn theirs in the background
void backfillSeries(db, igdb);
setInterval(() => {
    purgeExpiredSessions(db);
    pruneErrors(db);
}, 6 * 3600_000).unref();

serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`GameQueue listening on http://localhost:${info.port}`);
});
