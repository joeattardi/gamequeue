import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    entriesToCsv,
    entryQuerySchema,
    exportFileSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HitLimiter } from '../auth/rate-limit.js';
import { HttpError } from '../errors.js';
import { csvResponse } from '../http.js';
import { listEntries } from '../services/entries.js';
import { buildExport } from '../services/export.js';
import { importData, resolveImportCatalog } from '../services/import.js';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ISSUES = 50;
/** Committed imports per user per day; dry runs don't count. In memory, so a restart resets it. */
export const IMPORTS_PER_DAY = 10;

export function dataRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const commits = new HitLimiter(IMPORTS_PER_DAY, 24 * 3600_000);

    r.get('/export', (c) => {
        const now = new Date();
        const file = buildExport(db, c.get('user').id, now);
        return c.body(JSON.stringify(file, null, 2), 200, {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Disposition': `attachment; filename="gamequeue-export-${now.toISOString().slice(0, 10)}.json"`,
            'Cache-Control': 'no-store'
        });
    });

    /** The whole collection as a spreadsheet: a one-way export for reading, not for restoring. */
    r.get('/export.csv', (c) =>
        csvResponse(
            c,
            'gamequeue-collection',
            entriesToCsv(listEntries(db, c.get('user').id, entryQuerySchema.parse({})))
        )
    );

    /**
     * Merges an export file into the user's data. Without `?commit=true` this is a dry run that
     * writes nothing of the user's and returns what importing would do.
     */
    r.post(
        '/import',
        bodyLimit({
            maxSize: MAX_BYTES,
            onError: (c) => c.json({ error: 'That file is too large (50 MB maximum).' }, 413)
        }),
        async (c) => {
            const raw: unknown = await c.req.json().catch(() => undefined);
            if (raw === undefined) throw new HttpError(400, "That file isn't valid JSON");

            const head = raw as { format?: unknown; version?: unknown } | null;
            if (!head || typeof head !== 'object' || head.format !== EXPORT_FORMAT) {
                throw new HttpError(400, "That doesn't look like a GameQueue export file");
            }
            if (head.version !== EXPORT_VERSION) {
                throw new HttpError(
                    400,
                    typeof head.version === 'number' && head.version > EXPORT_VERSION
                        ? `This export is from a newer version of GameQueue (format ${head.version}). Update the app and try again.`
                        : `Unsupported export format version: ${String(head.version)}`
                );
            }

            const parsed = exportFileSchema.safeParse(raw);
            if (!parsed.success) {
                throw new HttpError(400, 'The file has problems, so nothing was imported', {
                    details: parsed.error.issues
                        .slice(0, MAX_ISSUES)
                        .map((i) => ({ path: i.path.join('.'), message: i.message })),
                    totalIssues: parsed.error.issues.length
                });
            }

            const userId = c.get('user').id;
            const dryRun = c.req.query('commit') !== 'true';
            if (!dryRun) {
                const { retryAfter } = commits.hit(String(userId));
                if (retryAfter > 0) {
                    c.header('Retry-After', String(retryAfter));
                    throw new HttpError(
                        429,
                        `You can import up to ${IMPORTS_PER_DAY} files a day. Try again tomorrow.`
                    );
                }
            }
            // Games come from the mirror or IGDB, never from the file (see resolveImportCatalog)
            const catalog = await resolveImportCatalog(db, igdb, parsed.data);
            const report = importData(db, userId, parsed.data, catalog, { dryRun });
            return c.json({ report });
        }
    );

    return r;
}
