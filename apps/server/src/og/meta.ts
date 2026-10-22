import { isRecapYear, usernameSchema } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { HttpError } from '../errors.js';
import { cardKey, getProfileCardData, getRecapCardData } from '../services/og.js';
import { getProfileRecap } from '../services/profile.js';
import { CARD_HEIGHT, CARD_WIDTH } from './cards.js';

/** Link-preview tags for one page. */
export interface PageMeta {
    title: string;
    description: string;
    /** Absolute URL of the page */
    url: string;
    /** Absolute URL of the share card */
    image: string;
    imageAlt: string;
}

const PROFILE_PATH = /^\/u\/([^/]+)\/?$/;
const RECAP_PATH = /^\/u\/([^/]+)\/recap(?:\/(\d{4}))?\/?$/;

const count = (n: number, one: string, many = `${one}s`) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The preview tags for a public page that has a share card (a profile or a year in review), or null for
 * any other path and for users that don't exist (the web app shows its own not-found page).
 * Crawlers don't run JavaScript, so these must be in the HTML the server sends.
 */
export function pageMeta(db: Db, config: Config, path: string): PageMeta | null {
    const profile = PROFILE_PATH.exec(path);
    const recap = RECAP_PATH.exec(path);
    const match = recap ?? profile;
    if (!match) return null;
    let raw: string;
    try {
        raw = decodeURIComponent(match[1]!);
    } catch {
        return null; // malformed %-escape
    }
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) return null;
    const host = new URL(config.publicUrl).host;
    try {
        if (recap) {
            const requested = recap[2];
            if (requested !== undefined && !isRecapYear(requested)) return null;
            // Name the year explicitly so the image URL (and so its cache entry) is for that year
            const year = requested ? Number(requested) : getProfileRecap(db, parsed.data).year;
            const data = getRecapCardData(db, parsed.data, year, host);
            return {
                title: `${data.username}'s ${year} in games | GameQueue`,
                description:
                    `${data.headline.value.toLocaleString('en-US')} ${data.headline.label} in ${year}` +
                    (data.hours ? `, about ${count(data.hours, 'hour')} of play time` : '') +
                    (data.archetype ? `. ${data.archetype}.` : '.'),
                url: `${config.publicUrl}/u/${data.username}/recap/${year}`,
                image: `${config.publicUrl}/api/og/recap/${data.username}/${year}.png?v=${cardKey(data)}`,
                imageAlt: `${data.username}'s ${year} year in review on GameQueue`
            };
        }
        const data = getProfileCardData(db, parsed.data, host);
        return {
            title: `${data.username}'s Profile | GameQueue`,
            description:
                `${count(data.total, 'game')} in the collection, ${data.finished} finished, ${data.backlog} in the backlog.` +
                (data.playing ? ' Playing right now.' : ''),
            url: `${config.publicUrl}/u/${data.username}`,
            image: `${config.publicUrl}/api/og/profile/${data.username}.png?v=${cardKey(data)}`,
            imageAlt: `${data.username}'s game collection on GameQueue`
        };
    } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
    }
}

const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts the tags into the built `index.html`: replaces its `<title>` and adds the meta tags before `</head>`. */
export function injectMeta(html: string, m: PageMeta): string {
    const tag = (attr: 'property' | 'name', key: string, value: string | number) =>
        `<meta ${attr}="${key}" content="${escape(String(value))}" />`;
    const tags = [
        tag('name', 'description', m.description),
        tag('property', 'og:type', 'website'),
        tag('property', 'og:site_name', 'GameQueue'),
        tag('property', 'og:title', m.title),
        tag('property', 'og:description', m.description),
        tag('property', 'og:url', m.url),
        tag('property', 'og:image', m.image),
        tag('property', 'og:image:type', 'image/png'),
        tag('property', 'og:image:width', CARD_WIDTH),
        tag('property', 'og:image:height', CARD_HEIGHT),
        tag('property', 'og:image:alt', m.imageAlt),
        tag('name', 'twitter:card', 'summary_large_image'),
        tag('name', 'twitter:title', m.title),
        tag('name', 'twitter:description', m.description),
        tag('name', 'twitter:image', m.image)
    ].join('\n        ');
    return html
        .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(m.title)}</title>`)
        .replace('</head>', () => `    ${tags}\n    </head>`);
}
