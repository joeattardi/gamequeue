import { isRecapYear, usernameSchema } from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { HttpError } from '../errors.js';
import {
    cardKey,
    getGridCardData,
    getProfileCardData,
    getRecapCardData,
    getTierCardData
} from '../services/og.js';
import { getPublicGrid } from '../services/grids.js';
import { getPublicTierList } from '../services/tier-lists.js';
import { getProfileRecap } from '../services/profile.js';
import { CARD_HEIGHT, CARD_WIDTH } from './cards.js';

/** Link-preview tags for one page. */
export interface PageMeta {
    title: string;
    description: string;
    /** Absolute URL of the page */
    url: string;
    /** Absolute URL of the share card; pages without one get a text-only preview */
    image?: string;
    imageAlt?: string;
}

const PROFILE_PATH = /^\/u\/([^/]+)\/?$/;
const RECAP_PATH = /^\/u\/([^/]+)\/recap(?:\/(\d{4}))?\/?$/;
const GRID_PATH = /^\/u\/([^/]+)\/grids\/(\d+)\/?$/;
const TIER_PATH = /^\/u\/([^/]+)\/tiers\/(\d+)\/?$/;

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
    const grid = GRID_PATH.exec(path);
    const tier = TIER_PATH.exec(path);
    const match = grid ?? tier ?? recap ?? profile;
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
        if (grid || tier) {
            const id = Number((grid ?? tier)![2]);
            if (!Number.isSafeInteger(id) || id < 1) return null;
            return grid
                ? gridMeta(db, config, parsed.data, id, host)
                : tierMeta(db, config, parsed.data, id, host);
        }
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

/** What goes in a link preview's description: the owner's own words if they wrote any, else a summary. */
const described = (own: string, summary: string) =>
    own.trim() ? (own.length > 200 ? `${own.slice(0, 197)}…` : own) : summary;

function gridMeta(db: Db, config: Config, username: string, id: number, host: string): PageMeta {
    const grid = getPublicGrid(db, username, id);
    const data = getGridCardData(db, username, id, host);
    return {
        title: `${grid.title} by ${username} | GameQueue`,
        description: described(
            grid.description,
            `A ${grid.cols} by ${grid.rows} grid of games by ${username}, ${data.filled} of ${grid.cols * grid.rows} filled.`
        ),
        url: `${config.publicUrl}/u/${username}/grids/${id}`,
        image: `${config.publicUrl}/api/og/grid/${username}/${id}.png?v=${cardKey(data)}`,
        imageAlt: `${grid.title}, a grid of games by ${username} on GameQueue`
    };
}

function tierMeta(db: Db, config: Config, username: string, id: number, host: string): PageMeta {
    const list = getPublicTierList(db, username, id);
    const data = getTierCardData(db, username, id, host);
    const tiers = list.tiers.filter((t) => t.items.length > 0).length;
    return {
        title: `${list.title} by ${username} | GameQueue`,
        description: described(
            list.description,
            `A tier list by ${username}: ${count(data.ranked, 'game')} ranked across ${count(tiers, 'tier')}.`
        ),
        url: `${config.publicUrl}/u/${username}/tiers/${id}`,
        image: `${config.publicUrl}/api/og/tiers/${username}/${id}.png?v=${cardKey(data)}`,
        imageAlt: `${list.title}, a tier list by ${username} on GameQueue`
    };
}

const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts the tags into the built `index.html`: replaces its `<title>` and adds the meta tags before `</head>`. */
export function injectMeta(html: string, m: PageMeta): string {
    const tag = (attr: 'property' | 'name', key: string, value: string | number) =>
        `<meta ${attr}="${key}" content="${escape(String(value))}" />`;
    const tags = [
        `<link rel="canonical" href="${escape(m.url)}" />`,
        tag('name', 'description', m.description),
        tag('property', 'og:type', 'website'),
        tag('property', 'og:site_name', 'GameQueue'),
        tag('property', 'og:title', m.title),
        tag('property', 'og:description', m.description),
        tag('property', 'og:url', m.url),
        ...(m.image
            ? [
                  tag('property', 'og:image', m.image),
                  tag('property', 'og:image:type', 'image/png'),
                  tag('property', 'og:image:width', CARD_WIDTH),
                  tag('property', 'og:image:height', CARD_HEIGHT),
                  tag('property', 'og:image:alt', m.imageAlt ?? ''),
                  tag('name', 'twitter:card', 'summary_large_image'),
                  tag('name', 'twitter:image', m.image)
              ]
            : [tag('name', 'twitter:card', 'summary')]),
        tag('name', 'twitter:title', m.title),
        tag('name', 'twitter:description', m.description)
    ].join('\n        ');
    return html
        .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(m.title)}</title>`)
        .replace('</head>', () => `    ${tags}\n    </head>`);
}
