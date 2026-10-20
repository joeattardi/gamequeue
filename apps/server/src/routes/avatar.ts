import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AVATAR_MAX_BYTES, avatarUploadSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { validate } from '../http.js';
import { removeAvatar, setAvatar } from '../services/avatars.js';

/** The signed-in user's own avatar. Reading one is public and lives in `routes/profile.ts`. */
export function avatarRoutes({ db, config }: AppDeps) {
    const r = new Hono<{ Variables: AuthVars }>();
    r.use('*', requireAuth(db, config));

    r.put(
        '/',
        // base64 inflates by a third; the schema checks the exact limit
        bodyLimit({
            maxSize: Math.ceil(AVATAR_MAX_BYTES * 1.5),
            onError: (c) => c.json({ error: 'That image is too large' }, 413)
        }),
        async (c) => {
            const raw: unknown = await c.req.json().catch(() => undefined);
            if (raw === undefined) throw new HttpError(400, 'Invalid request');
            const input = validate(avatarUploadSchema, raw);
            const avatarUpdatedAt = setAvatar(db, c.get('user').id, input.contentType, input.data);
            return c.json({ avatarUpdatedAt });
        }
    );

    r.delete('/', (c) => {
        removeAvatar(db, c.get('user').id);
        return c.json({ avatarUpdatedAt: null });
    });

    return r;
}
