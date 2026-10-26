import { Hono } from 'hono';
import type { AppDeps } from '../app.js';

const COUNT = 3;

/**
 * Public: deliberately has no requireAuth. Covers of random well-known games from the IGDB mirror,
 * never from the shared cache: an import file can put its own games and cover ids there, and this is
 * the one page every anonymous visitor sees. Empty without a mirror (the page shows placeholders).
 */
export function showcaseRoutes({ igdb }: AppDeps) {
    const r = new Hono();
    r.get('/', (c) => {
        // A different pick on every visit, so it must not be cached
        c.header('Cache-Control', 'no-store');
        return c.json({ games: igdb?.local?.()?.showcase(COUNT) ?? [] });
    });
    return r;
}
