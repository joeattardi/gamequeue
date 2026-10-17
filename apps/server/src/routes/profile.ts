import { Hono } from 'hono';
import { usernameSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import { getProfile, getProfileQueue } from '../services/profile.js';

/** Public: deliberately has no requireAuth. */
export function profileRoutes({ db }: AppDeps) {
    const r = new Hono();
    const parseUsername = (raw: string) => {
        const username = usernameSchema.safeParse(raw);
        if (!username.success) throw new HttpError(404, 'Not found');
        return username.data;
    };
    r.get('/:username', (c) =>
        c.json({ profile: getProfile(db, parseUsername(c.req.param('username'))) })
    );
    r.get('/:username/queue', (c) =>
        c.json({ queue: getProfileQueue(db, parseUsername(c.req.param('username'))) })
    );
    return r;
}
