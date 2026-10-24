import { loadConfig } from '../config.js';
import { createDumpSource, type DumpSource } from './dumps.js';
import { runMirrorJob } from './job.js';

/**
 * `npm run igdb:mirror [-- --force]` (`node dist/mirror/cli.js` in production, started daily by
 * `scripts/mirror.sh`): downloads IGDB's dumps and rebuilds the local mirror, leaves
 * `mirror-status.json` behind for the admin page, and exits 1 when the run failed.
 */
async function main() {
    const config = loadConfig();
    const { igdbClientId, igdbClientSecret } = config;
    // Missing credentials are a failure like any other: the admin page should say so
    const source: DumpSource =
        igdbClientId && igdbClientSecret
            ? createDumpSource({ clientId: igdbClientId, clientSecret: igdbClientSecret })
            : {
                  list: async () => {
                      throw new Error('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set');
                  },
                  open: async () => {
                      throw new Error('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set');
                  }
              };
    const run = await runMirrorJob({
        source,
        path: config.igdbMirrorPath,
        force: process.argv.includes('--force'),
        log: (message) => console.log(`[mirror] ${message}`)
    });
    if (run.ok) console.log(`[mirror] ${run.result} in ${run.seconds}s`);
    else {
        console.error(`[mirror] failed: ${run.error}`);
        process.exit(1);
    }
}

void main();
