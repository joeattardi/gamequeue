import { Hono } from 'hono';
import { and, isNotNull, ne, sql } from 'drizzle-orm';
import type { ShowcaseGameDto } from '@gamequeue/shared';
import type { AppDeps } from '../app.js';
import { games } from '../db/schema.js';

const COUNT = 3;

/** Public: deliberately has no requireAuth. Metadata of cached games only, nothing about any user. */
export function showcaseRoutes({ db }: AppDeps) {
    const r = new Hono();
    r.get('/', (c) => {
        const rows = db
            .select({ id: games.id, name: games.name, coverImageId: games.coverImageId })
            .from(games)
            .where(and(isNotNull(games.coverImageId), ne(games.coverImageId, '')))
            .orderBy(sql`random()`)
            .limit(COUNT)
            .all();
        // A different pick on every visit, so it must not be cached
        c.header('Cache-Control', 'no-store');
        return c.json({ games: rows as ShowcaseGameDto[] });
    });
    return r;
}
