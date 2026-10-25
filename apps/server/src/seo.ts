import { usernameSchema } from '@gamequeue/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { users } from './db/schema.js';
import { pageMeta, type PageMeta } from './og/meta.js';

/** How the SPA shell is served for one path. */
export interface PageSeo {
    status: 200 | 404;
    /** Send `X-Robots-Tag: noindex`; the page may still be crawled and shared */
    noindex: boolean;
    /** Link-preview and canonical tags to add to the HTML, if the page has any */
    meta: PageMeta | null;
}

const PROFILE_AREA = /^\/u\/([^/]+)(?:\/|$)/;

/**
 * What `robots.txt` says. Only the API is off limits (the share-card images stay open so link previews
 * work). The app and profile pages are deliberately not disallowed: a crawler has to fetch a page to see
 * its `noindex`, and a blocked URL can still end up in results.
 */
export const robotsTxt = () => 'User-agent: *\nDisallow: /api/\nAllow: /api/og/\n';

function landingMeta(config: Config): PageMeta {
    return {
        title: 'GameQueue | Know exactly what to play next',
        description:
            'Keep your whole game collection in one place and turn your backlog into a plan: a few games in play, an ordered queue, and a random pick when you would rather not choose.',
        url: `${config.publicUrl}/`
    };
}

/**
 * Indexing rules for a path:
 * - the landing page is indexable;
 * - a profile area (`/u/:username/...`) is indexable only when its owner ticked "Allow search engines" on
 *   the Account page, and a user that doesn't exist is a real 404;
 * - everything else (login, register and the signed-in app, which crawlers only see as redirects to
 *   login) is noindex.
 * Link-preview tags are independent of the opt-in, so shared links keep their previews.
 */
export function pageSeo(db: Db, config: Config, path: string): PageSeo {
    if (path === '/') return { status: 200, noindex: false, meta: landingMeta(config) };
    const area = PROFILE_AREA.exec(path);
    if (!area) return { status: 200, noindex: true, meta: null };

    let raw: string;
    try {
        raw = decodeURIComponent(area[1]!);
    } catch {
        return { status: 404, noindex: true, meta: null };
    }
    const username = usernameSchema.safeParse(raw);
    const user = username.success
        ? db
              .select({ searchIndexable: users.searchIndexable })
              .from(users)
              .where(and(eq(users.username, username.data), isNotNull(users.emailVerifiedAt)))
              .get()
        : undefined;
    if (!user) return { status: 404, noindex: true, meta: null };
    return {
        status: 200,
        noindex: !user.searchIndexable,
        meta: pageMeta(db, config, path)
    };
}
