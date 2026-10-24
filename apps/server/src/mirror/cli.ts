import { loadConfig } from '../config.js';
import { createDumpSource } from './dumps.js';
import { runMirror } from './run.js';

/** `npm run igdb:mirror [-- --force]`: downloads IGDB's dumps and rebuilds the local mirror. */
async function main() {
    const config = loadConfig();
    if (!config.igdbClientId || !config.igdbClientSecret) {
        console.error('IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set');
        process.exit(1);
    }
    const started = Date.now();
    const log = (message: string) => console.log(`[mirror] ${message}`);
    const result = await runMirror({
        source: createDumpSource({
            clientId: config.igdbClientId,
            clientSecret: config.igdbClientSecret
        }),
        path: config.igdbMirrorPath,
        force: process.argv.includes('--force'),
        log
    });
    log(`${result.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
    console.error(`[mirror] failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
});
