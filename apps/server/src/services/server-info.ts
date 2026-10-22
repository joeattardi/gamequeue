import { existsSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ServerInfoDto } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { listRuns } from './server-runs.js';

const startedAt = Date.now();

/** Free space on the volume that holds the database (what `df` would show for it). */
function disk(config: Config): ServerInfoDto['disk'] {
    try {
        let dir = dirname(resolve(config.databasePath));
        while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir); // not created yet
        const s = statfsSync(dir);
        // bavail is what a non-root process can actually use
        return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
    } catch {
        return null;
    }
}

export function readServerInfo(db: Db, config: Config): ServerInfoDto {
    const mem = process.memoryUsage();
    return {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        nodeEnv: process.env.NODE_ENV ?? 'development',
        startedAt,
        version: config.version,
        runs: listRuns(db),
        uptimeSeconds: Math.round(process.uptime()),
        memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
        config: {
            port: config.port,
            databasePath: config.databasePath,
            secureCookies: config.secureCookies,
            trustProxy: config.trustProxy,
            allowedOrigins: config.allowedOrigins,
            igdbConfigured: !!(config.igdbClientId && config.igdbClientSecret)
        },
        disk: disk(config)
    };
}
