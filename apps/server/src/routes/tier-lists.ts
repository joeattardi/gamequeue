import { Hono } from 'hono';
import {
    addTierItemSchema,
    addTierSchema,
    createTierListSchema,
    moveTierItemSchema,
    patchTierListSchema,
    patchTierSchema,
    reorderTiersSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    addTier,
    addTierItem,
    createTierList,
    deleteTier,
    deleteTierList,
    getTierList,
    listTierLists,
    moveTierItem,
    patchTier,
    patchTierList,
    removeTierItem,
    reorderTiers
} from '../services/tier-lists.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/** The signed-in user's tier lists. Anyone's is read through `/api/profiles/:username/tier-lists/:id`. */
export function tierListRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;
    const id = (c: { req: { param(k: string): string } }) => parseId(c.req.param('id'));

    r.get('/', (c) => c.json({ tierLists: listTierLists(db, uid(c)) }));
    r.post('/', async (c) =>
        c.json({
            tierList: createTierList(db, uid(c), validate(createTierListSchema, await body(c)))
        })
    );
    r.get('/:id', (c) => c.json({ tierList: getTierList(db, uid(c), id(c)) }));
    r.patch('/:id', async (c) =>
        c.json({
            tierList: patchTierList(db, uid(c), id(c), validate(patchTierListSchema, await body(c)))
        })
    );
    r.delete('/:id', (c) => {
        deleteTierList(db, uid(c), id(c));
        return c.json({ ok: true });
    });

    r.post('/:id/tiers', async (c) =>
        c.json({ tierList: addTier(db, uid(c), id(c), validate(addTierSchema, await body(c))) })
    );
    // Before "/:id/tiers/:tierId" so "order" isn't read as a tier id
    r.put('/:id/tiers/order', async (c) =>
        c.json({
            tierList: reorderTiers(
                db,
                uid(c),
                id(c),
                validate(reorderTiersSchema, await body(c)).tierIds
            )
        })
    );
    r.patch('/:id/tiers/:tierId', async (c) =>
        c.json({
            tierList: patchTier(
                db,
                uid(c),
                id(c),
                parseId(c.req.param('tierId')),
                validate(patchTierSchema, await body(c))
            )
        })
    );
    r.delete('/:id/tiers/:tierId', (c) =>
        c.json({ tierList: deleteTier(db, uid(c), id(c), parseId(c.req.param('tierId'))) })
    );

    r.post('/:id/items', async (c) =>
        c.json({
            tierList: await addTierItem(
                db,
                igdb,
                uid(c),
                id(c),
                validate(addTierItemSchema, await body(c))
            )
        })
    );
    r.put('/:id/items/move', async (c) =>
        c.json({
            tierList: moveTierItem(db, uid(c), id(c), validate(moveTierItemSchema, await body(c)))
        })
    );
    r.delete('/:id/items/:igdbId', (c) =>
        c.json({
            tierList: removeTierItem(db, uid(c), id(c), parseId(c.req.param('igdbId')))
        })
    );
    return r;
}
