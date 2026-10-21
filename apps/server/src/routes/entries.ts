import { Hono } from 'hono';
import { addEntrySchema, entryQuerySchema, patchEntrySchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { parseId, validate } from '../http.js';
import {
    addEntry,
    deleteEntry,
    getEntry,
    getFacetCounts,
    getFacets,
    listEntries,
    patchEntry
} from '../services/entries.js';
import { ensureScreenshots } from '../services/games.js';

const FACET_KEYS = ['status', 'platform', 'genre', 'series', 'tag'];

/** Facet params may repeat; everything else is single-valued. */
function parseEntryQuery(raw: Record<string, string[]>) {
    return validate(
        entryQuerySchema,
        Object.fromEntries(
            Object.entries(raw).map(([k, v]) => [k, FACET_KEYS.includes(k) ? v : v[0]])
        )
    );
}

export function entryRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.get('/', (c) =>
        c.json({
            entries: listEntries(db, c.get('user').id, parseEntryQuery(c.req.queries()))
        })
    );

    // Registered before "/:id" so "facets" isn't read as an id
    r.get('/facets', (c) => c.json(getFacets(db, c.get('user').id)));

    r.get('/facet-counts', (c) =>
        c.json(getFacetCounts(db, c.get('user').id, parseEntryQuery(c.req.queries())))
    );

    r.post('/', async (c) => {
        const input = validate(addEntrySchema, await c.req.json().catch(() => undefined));
        return c.json({ entry: await addEntry(db, igdb, c.get('user').id, input) }, 201);
    });

    r.get('/:id', async (c) => {
        const userId = c.get('user').id;
        const id = parseId(c.req.param('id'));
        let entry = getEntry(db, userId, id);
        if (!entry) throw new HttpError(404, 'Entry not found');
        // Games cached before screenshots were stored get them on first view
        if (await ensureScreenshots(db, igdb, entry.game.id)) entry = getEntry(db, userId, id)!;
        return c.json({ entry });
    });

    r.patch('/:id', async (c) => {
        const patch = validate(patchEntrySchema, await c.req.json().catch(() => undefined));
        return c.json({
            entry: patchEntry(db, c.get('user').id, parseId(c.req.param('id')), patch)
        });
    });

    r.delete('/:id', (c) => {
        if (!deleteEntry(db, c.get('user').id, parseId(c.req.param('id'))))
            throw new HttpError(404, 'Entry not found');
        return c.json({ ok: true });
    });

    return r;
}
