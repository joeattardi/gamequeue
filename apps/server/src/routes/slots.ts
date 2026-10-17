import { Hono } from 'hono';
import {
    assignSlotSchema,
    createSlotSchema,
    patchSlotSchema,
    reorderSlotsSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    assignToSlot,
    clearSlot,
    createSlot,
    deleteSlot,
    listSlots,
    renameSlot,
    reorderSlots
} from '../services/slots.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

export function slotRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.get('/', (c) => c.json({ slots: listSlots(db, c.get('user').id) }));
    r.post('/', async (c) =>
        c.json(
            {
                slots: createSlot(
                    db,
                    c.get('user').id,
                    validate(createSlotSchema, await body(c)).name
                )
            },
            201
        )
    );
    r.put('/order', async (c) =>
        c.json({
            slots: reorderSlots(
                db,
                c.get('user').id,
                validate(reorderSlotsSchema, await body(c)).ids
            )
        })
    );
    r.patch('/:id', async (c) =>
        c.json({
            slots: renameSlot(
                db,
                c.get('user').id,
                parseId(c.req.param('id')),
                validate(patchSlotSchema, await body(c)).name
            )
        })
    );
    r.delete('/:id', (c) =>
        c.json({ slots: deleteSlot(db, c.get('user').id, parseId(c.req.param('id'))) })
    );
    r.put('/:id/entry', async (c) =>
        c.json({
            slots: assignToSlot(
                db,
                c.get('user').id,
                parseId(c.req.param('id')),
                validate(assignSlotSchema, await body(c))
            )
        })
    );
    r.delete('/:id/entry', (c) =>
        c.json({ slots: clearSlot(db, c.get('user').id, parseId(c.req.param('id'))) })
    );
    return r;
}
