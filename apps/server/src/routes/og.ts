import { Hono } from 'hono';
import { isRecapYear, usernameSchema } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import type { CardRenderer } from '../og/render.js';
import { getAvatarByUsername } from '../services/avatars.js';
import { cardKey, getProfileCardData, getRecapCardData } from '../services/og.js';

/** Public: deliberately has no requireAuth. These are the images behind the `og:image` of profile links. */
export function ogRoutes({ db, config, cards }: AppDeps & { cards: CardRenderer }) {
    const r = new Hono();
    const host = new URL(config.publicUrl).host;

    /** `joe.png` -> `joe`; anything else is a 404, so the image URLs are exactly the ones we hand out */
    const stem = (file: string) => {
        if (!file.endsWith('.png')) throw new HttpError(404, 'Not found');
        return file.slice(0, -'.png'.length);
    };
    const parseUsername = (raw: string) => {
        const username = usernameSchema.safeParse(raw);
        if (!username.success) throw new HttpError(404, 'Not found');
        return username.data;
    };
    const avatarOf = (username: string, version: number | null) => {
        const avatar = version === null ? undefined : getAvatarByUsername(db, username);
        return avatar ? { contentType: avatar.contentType, data: avatar.data } : null;
    };
    const png = (bytes: Buffer) =>
        // The ?v= in the URL we hand out changes with the content, but this handler ignores it, so no `immutable`
        new Response(new Uint8Array(bytes), {
            headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' }
        });

    r.get('/profile/:file', async (c) => {
        const username = parseUsername(stem(c.req.param('file')));
        const data = getProfileCardData(db, username, host);
        return png(
            await cards.render(cardKey(data), {
                data,
                avatar: avatarOf(data.username, data.avatarVersion)
            })
        );
    });
    r.get('/recap/:username/:file', async (c) => {
        const year = stem(c.req.param('file'));
        if (!isRecapYear(year)) throw new HttpError(404, 'Not found');
        const data = getRecapCardData(
            db,
            parseUsername(c.req.param('username')),
            Number(year),
            host
        );
        return png(
            await cards.render(cardKey(data), {
                data,
                avatar: avatarOf(data.username, data.avatarVersion)
            })
        );
    });
    return r;
}
