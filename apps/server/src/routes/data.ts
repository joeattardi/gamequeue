import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { EXPORT_FORMAT, EXPORT_VERSION, exportFileSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { buildExport } from '../services/export.js';
import { importData } from '../services/import.js';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ISSUES = 50;

export function dataRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.get('/export', (c) => {
        const now = new Date();
        const file = buildExport(db, c.get('user').id, now);
        return c.body(JSON.stringify(file, null, 2), 200, {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Disposition': `attachment; filename="gamequeue-export-${now.toISOString().slice(0, 10)}.json"`,
            'Cache-Control': 'no-store'
        });
    });

    /**
     * Merges an export file into the user's data. Without `?commit=true` this is a dry run that
     * writes nothing and returns what importing would do.
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

            const dryRun = c.req.query('commit') !== 'true';
            return c.json({ report: importData(db, c.get('user').id, parsed.data, { dryRun }) });
        }
    );

    return r;
}
