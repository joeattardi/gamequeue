import { Hono } from 'hono';
import { usernameSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import { getProfile } from '../services/profile.js';

/** Public: deliberately has no requireAuth. */
export function profileRoutes({ db }: AppDeps) {
    const r = new Hono();
    r.get('/:username', (c) => {
        const username = usernameSchema.safeParse(c.req.param('username'));
        if (!username.success) throw new HttpError(404, 'Not found');
        return c.json({ profile: getProfile(db, username.data) });
    });
    return r;
}
