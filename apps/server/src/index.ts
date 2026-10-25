import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { createIgdbClient } from './igdb/client.js';
import { createMirrorIgdbClient } from './mirror/client.js';
import { createCloudflareClient } from './cloudflare/client.js';
import { createItadClient } from './itad/client.js';
import { recordIgdbAttempt, pruneIgdbHistory } from './services/igdb-history.js';
import { endRun, HEARTBEAT_MS, heartbeat, pruneRuns, startRun } from './services/server-runs.js';
import { createErrorAlerter } from './services/error-alerts.js';
import { reportError, pruneErrors, setErrorAlerter } from './services/error-log.js';
import { purgeUnverified } from './services/email-verification.js';
import { createNotifier } from './services/notify.js';
import { backfillSeries } from './services/games.js';
import { MIRROR_SYNC_CHECK_MS, syncFromMirrorIfNew } from './services/mirror-sync.js';
import { reportMirrorRunFailure } from './services/mirror-status.js';
import { mountWeb } from './web.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const liveIgdb =
    config.igdbClientId && config.igdbClientSecret
        ? createIgdbClient({
              clientId: config.igdbClientId,
              clientSecret: config.igdbClientSecret,
              onAttempt: (a) => recordIgdbAttempt(db, a.ok, a.status),
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
// A mirror built by `npm run igdb:mirror` answers first and the live client covers what it can't; the
// file is checked again as it is replaced, so building one later needs no restart
const igdb =
    liveIgdb || existsSync(config.igdbMirrorPath)
        ? createMirrorIgdbClient({ path: config.igdbMirrorPath, fallback: liveIgdb })
        : undefined;
if (!igdb)
    console.warn('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set: search and add-game are disabled.');
else if (existsSync(config.igdbMirrorPath))
    console.log(`IGDB mirror: ${config.igdbMirrorPath}${liveIgdb ? '' : ' (no live IGDB)'}`);
else if (liveIgdb)
    console.log(
        `IGDB mirror: none at ${config.igdbMirrorPath}, using live IGDB (npm run igdb:mirror builds one)`
    );
// Errors are always recorded, but only a production server emails about them: they are expected
// while developing
if (process.env.NODE_ENV === 'production')
    setErrorAlerter(createErrorAlerter(db, createNotifier(config)));
// After the alerter is set, so an unclean previous run is reported like any other error
if (!config.emailVerification)
    console.warn(
        'RESEND_API_KEY / MAIL_FROM not set: new accounts are not asked to verify their email.'
    );
const runId = startRun(db, config.version);
const itad = config.itadApiKey
    ? createItadClient({ apiKey: config.itadApiKey, country: config.itadCountry })
    : undefined;
const cloudflare =
    config.cloudflareApiToken && config.cloudflareZoneId
        ? createCloudflareClient({
              apiToken: config.cloudflareApiToken,
              zoneId: config.cloudflareZoneId
          })
        : undefined;
const app = createApp({ db, config, igdb, itad, cloudflare });

// Production: serve the built web app from the same process/port, with SPA fallback.
const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
if (existsSync(webDist)) mountWeb(app, { db, config }, webDist);

// Anything that escapes a handler or a background job is recorded, then the process exits as Node
// would anyway; the container restarts it. The insert is synchronous, so it lands before the exit.
for (const event of ['uncaughtException', 'unhandledRejection'] as const)
    process.on(event, (err) => {
        reportError(db, 'process_crash', err, { context: { event } });
        endRun(db, runId, 'crash');
        process.exit(1);
    });

// A stop we asked for (docker stop, a deploy, Ctrl-C) is recorded as clean; anything else leaves the
// run open and the next start reports it
for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
        endRun(db, runId, 'clean');
        process.exit(0);
    });
setInterval(() => heartbeat(db, runId), HEARTBEAT_MS).unref();

purgeExpiredSessions(db);
purgeUnverified(db);
pruneErrors(db);
pruneIgdbHistory(db);
pruneRuns(db);
// Games cached before series were stored learn theirs in the background
void backfillSeries(db, igdb);
// Cached games take the mirror's metadata whenever a newly built mirror appears
const checkMirror = () => {
    void syncFromMirrorIfNew(db, igdb);
    reportMirrorRunFailure(db, config);
};
checkMirror();
setInterval(checkMirror, MIRROR_SYNC_CHECK_MS).unref();
setInterval(() => {
    purgeExpiredSessions(db);
    purgeUnverified(db);
    pruneErrors(db);
    pruneIgdbHistory(db);
    pruneRuns(db);
}, 6 * 3600_000).unref();

serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`GameQueue listening on http://localhost:${info.port}`);
});
