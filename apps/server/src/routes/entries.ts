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
    getFacets,
    listEntries,
    patchEntry
} from '../services/entries.js';

export function entryRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.get('/', (c) =>
        c.json({
            entries: listEntries(db, c.get('user').id, validate(entryQuerySchema, c.req.query()))
        })
    );

    // Registered before "/:id" so "facets" isn't read as an id
    r.get('/facets', (c) => c.json(getFacets(db, c.get('user').id)));

    r.post('/', async (c) => {
        const input = validate(addEntrySchema, await c.req.json().catch(() => undefined));
        return c.json({ entry: await addEntry(db, igdb, c.get('user').id, input) }, 201);
    });

    r.get('/:id', (c) => {
        const entry = getEntry(db, c.get('user').id, parseId(c.req.param('id')));
        if (!entry) throw new HttpError(404, 'Entry not found');
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
