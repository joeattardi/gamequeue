import { Hono } from 'hono';
import {
    createGridSchema,
    patchGridSchema,
    setGridCellSchema,
    swapGridCellsSchema
} from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { parseId, validate } from '../http.js';
import {
    createGrid,
    deleteGrid,
    getGrid,
    listGrids,
    patchGrid,
    setGridCell,
    swapGridCells
} from '../services/grids.js';

const body = (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => undefined);

/** The signed-in user's grids. Anyone's grid is read through `/api/profiles/:username/grids/:id`. */
export function gridRoutes({ db, config, igdb }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));
    const uid = (c: { get(k: 'user'): { id: number } }) => c.get('user').id;

    r.get('/', (c) => c.json({ grids: listGrids(db, uid(c)) }));
    r.post('/', async (c) =>
        c.json({ grid: createGrid(db, uid(c), validate(createGridSchema, await body(c))) })
    );
    r.get('/:id', (c) => c.json({ grid: getGrid(db, uid(c), parseId(c.req.param('id'))) }));
    r.patch('/:id', async (c) =>
        c.json({
            grid: patchGrid(
                db,
                uid(c),
                parseId(c.req.param('id')),
                validate(patchGridSchema, await body(c))
            )
        })
    );
    r.delete('/:id', (c) => {
        deleteGrid(db, uid(c), parseId(c.req.param('id')));
        return c.json({ ok: true });
    });
    r.put('/:id/cells/:position', async (c) =>
        c.json({
            grid: await setGridCell(
                db,
                igdb,
                uid(c),
                parseId(c.req.param('id')),
                Number(c.req.param('position')),
                validate(setGridCellSchema, await body(c))
            )
        })
    );
    r.put('/:id/swap', async (c) => {
        const { a, b } = validate(swapGridCellsSchema, await body(c));
        return c.json({ grid: swapGridCells(db, uid(c), parseId(c.req.param('id')), a, b) });
    });
    return r;
}
