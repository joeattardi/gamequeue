import { Hono } from 'hono';
import {
    addListItemSchema,
    createListSchema,
    patchListSchema,
    pickSchema,
    reorderListSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    addToList,
    createList,
    deleteList,
    ensureQueue,
    getList,
    getQueue,
    listLists,
    removeFromList,
    renameList,
    reorderList
} from '../services/lists.js';
import { pick } from '../services/pick.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

export function listRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;

    r.get('/', (c) => c.json({ lists: listLists(db, uid(c)) }));
    r.post('/', async (c) =>
        c.json(
            { list: createList(db, uid(c), validate(createListSchema, await body(c)).name) },
            201
        )
    );
    r.get('/:id', (c) => c.json({ list: getList(db, uid(c), parseId(c.req.param('id'))) }));
    r.patch('/:id', async (c) => {
        const id = parseId(c.req.param('id'));
        renameList(db, uid(c), id, validate(patchListSchema, await body(c)).name);
        return c.json({ list: getList(db, uid(c), id) });
    });
    r.delete('/:id', (c) => {
        deleteList(db, uid(c), parseId(c.req.param('id')));
        return c.json({ ok: true });
    });
    r.post('/:id/items', async (c) =>
        c.json({
            list: addToList(
                db,
                uid(c),
                parseId(c.req.param('id')),
                validate(addListItemSchema, await body(c)).entryId
            )
        })
    );
    r.delete('/:id/items/:entryId', (c) =>
        c.json({
            list: removeFromList(
                db,
                uid(c),
                parseId(c.req.param('id')),
                parseId(c.req.param('entryId'))
            )
        })
    );
    r.put('/:id/order', async (c) =>
        c.json({
            list: reorderList(
                db,
                uid(c),
                parseId(c.req.param('id')),
                validate(reorderListSchema, await body(c)).entryIds
            )
        })
    );
    return r;
}

export function pickRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    r.post('/', async (c) =>
        c.json(pick(db, c.get('user').id, validate(pickSchema, await body(c))))
    );
    return r;
}

/** The queue is a list with its own URL, so clients don't need to know its id up front. */
export function queueRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    const queueId = (c: { get(k: 'user'): { id: number } }) => ensureQueue(db, uid(c)).id;

    r.get('/', (c) => c.json({ list: getQueue(db, uid(c)) }));
    r.post('/items', async (c) =>
        c.json({
            list: addToList(
                db,
                uid(c),
                queueId(c),
                validate(addListItemSchema, await body(c)).entryId
            )
        })
    );
    r.delete('/items/:entryId', (c) =>
        c.json({
            list: removeFromList(db, uid(c), queueId(c), parseId(c.req.param('entryId')))
        })
    );
    r.put('/order', async (c) =>
        c.json({
            list: reorderList(
                db,
                uid(c),
                queueId(c),
                validate(reorderListSchema, await body(c)).entryIds
            )
        })
    );
    return r;
}
