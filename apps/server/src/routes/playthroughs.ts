import { Hono } from 'hono';
import {
    closeSchema,
    logPlaythroughSchema,
    patchPlaythroughSchema,
    startSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    closePlaythrough,
    deletePlaythrough,
    listPlaythroughs,
    logPlaythrough,
    patchPlaythrough,
    startPlaythrough,
    togglePause
} from '../services/playthroughs.js';

// Optional JSON body: an action with no body is the same as an empty object
const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => ({}));

/** Mounted at /api/entries (status actions + history) */
export function entryActionRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const ids = (c: { get(k: 'user'): { id: number }; req: { param(n: string): string } }) =>
        [c.get('user').id, parseId(c.req.param('id'))] as const;

    r.post('/:id/start', async (c) =>
        c.json({ entry: startPlaythrough(db, ...ids(c), validate(startSchema, await body(c))) })
    );
    r.post('/:id/pause', (c) => c.json({ entry: togglePause(db, ...ids(c), 'pause') }));
    r.post('/:id/resume', (c) => c.json({ entry: togglePause(db, ...ids(c), 'resume') }));
    r.post('/:id/finish', async (c) =>
        c.json({
            entry: closePlaythrough(db, ...ids(c), 'finish', validate(closeSchema, await body(c)))
        })
    );
    r.post('/:id/abandon', async (c) =>
        c.json({
            entry: closePlaythrough(db, ...ids(c), 'abandon', validate(closeSchema, await body(c)))
        })
    );
    r.get('/:id/playthroughs', (c) => c.json({ playthroughs: listPlaythroughs(db, ...ids(c)) }));
    r.post('/:id/playthroughs', async (c) =>
        c.json(
            { entry: logPlaythrough(db, ...ids(c), validate(logPlaythroughSchema, await body(c))) },
            201
        )
    );
    return r;
}

/** Mounted at /api/playthroughs (edit/delete one record) */
export function playthroughRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.patch('/:id', async (c) =>
        c.json({
            entry: patchPlaythrough(
                db,
                c.get('user').id,
                parseId(c.req.param('id')),
                validate(patchPlaythroughSchema, await body(c))
            )
        })
    );
    r.delete('/:id', (c) =>
        c.json({ entry: deletePlaythrough(db, c.get('user').id, parseId(c.req.param('id'))) })
    );
    return r;
}
