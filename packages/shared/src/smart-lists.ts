import { z } from 'zod';
import { ENTRY_STATUSES, type EntryDto, type EntryStatus } from './collection.js';

/**
 * Smart lists: a saved set of rules. Membership is computed from the collection every time, so
 * nothing is stored per game. Rules combine with AND; the pure logic here runs on the server (and
 * in the editor's live preview).
 */

export const SMART_NUMBER_FIELDS = [
    'ttb',
    'igdbScore',
    'rating',
    'addedDays',
    'changedDays',
    'finishedDays',
    'releaseYear'
] as const;
export type SmartNumberField = (typeof SMART_NUMBER_FIELDS)[number];

/** What each number field means and the unit its value is in (also the editor's labels). */
export const SMART_NUMBER_FIELD_INFO: Record<
    SmartNumberField,
    { label: string; unit: string; hint: string }
> = {
    ttb: {
        label: 'Time to beat',
        unit: 'minutes',
        hint: 'Unknown times never match at least/at most'
    },
    igdbScore: {
        label: 'IGDB score',
        unit: 'points (0-100)',
        hint: 'From IGDB; many games have none'
    },
    rating: { label: 'Your rating', unit: 'stars (1-5)', hint: 'Your own rating of the game' },
    addedDays: { label: 'Added to collection', unit: 'days ago', hint: 'Days since you added it' },
    changedDays: {
        label: 'Last changed',
        unit: 'days ago',
        hint: 'Days since its status, rating, notes or tags last changed'
    },
    finishedDays: {
        label: 'Last finished',
        unit: 'days ago',
        hint: 'Days since you last finished it; games never finished (or with no date) are unknown'
    },
    releaseYear: { label: 'Release year', unit: 'year', hint: 'The year IGDB lists' }
};

const count = z.number().int().min(0).max(100_000);
const names = z.array(z.string().trim().min(1).max(100)).min(1).max(100);

export const smartRuleSchema = z.union([
    z.object({ field: z.literal('status'), anyOf: z.array(z.enum(ENTRY_STATUSES)).min(1).max(5) }),
    z.object({
        field: z.literal('platform'),
        anyOf: z.array(z.number().int().positive()).min(1).max(100)
    }),
    z.object({ field: z.literal('genre'), anyOf: names }),
    z.object({ field: z.literal('tag'), anyOf: names }),
    // Finished (at least once) in any of these years, by the playthrough's end date
    z.object({
        field: z.literal('finishedYear'),
        anyOf: z.array(z.number().int().min(1950).max(2200)).min(1).max(100)
    }),
    z.object({
        field: z.enum(SMART_NUMBER_FIELDS),
        op: z.enum(['gte', 'lte']),
        value: count
    }),
    // "has no value", e.g. a finished game you never rated
    z.object({ field: z.enum(SMART_NUMBER_FIELDS), op: z.literal('unknown') })
]);
export type SmartRule = z.infer<typeof smartRuleSchema>;

export const smartRulesSchema = z.array(smartRuleSchema).min(1, 'Add at least one rule').max(20);

export const SMART_SORTS = [
    'title',
    'added',
    'release',
    'rating',
    'score',
    'ttb',
    'changed'
] as const;
export type SmartSort = (typeof SMART_SORTS)[number];
export const SMART_SORT_LABELS: Record<SmartSort, string> = {
    title: 'Title',
    added: 'Date added',
    release: 'Release date',
    rating: 'Your rating',
    score: 'IGDB score',
    ttb: 'Time to beat',
    changed: 'Last changed'
};

export type SortDir = 'asc' | 'desc';
export const defaultSmartDir = (sort: SmartSort): SortDir =>
    sort === 'title' || sort === 'ttb' || sort === 'changed' ? 'asc' : 'desc';

const smartName = z.string().trim().min(1, 'Give the list a name').max(60);

export const smartListInputSchema = z.object({
    name: smartName,
    rules: smartRulesSchema,
    sort: z.enum(SMART_SORTS).default('title'),
    /** Omit for the sort's natural direction */
    dir: z.enum(['asc', 'desc']).optional()
});
export type SmartListInput = z.infer<typeof smartListInputSchema>;

export interface SmartListSummaryDto {
    id: number;
    name: string;
    count: number;
    /** Cover image ids of the first few matching games, for the tile */
    covers: string[];
    /** The rules in words, one line each */
    description: string[];
}

export interface SmartListDetailDto {
    id: number;
    name: string;
    rules: SmartRule[];
    sort: SmartSort;
    dir: SortDir;
    description: string[];
    /** The matching games, in sort order */
    entries: EntryDto[];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

type SmartEntry = Pick<
    EntryDto,
    | 'status'
    | 'platforms'
    | 'tags'
    | 'ttbMinutes'
    | 'rating'
    | 'addedAt'
    | 'updatedAt'
    | 'lastFinishedOn'
    | 'finishedYears'
> & { game: Pick<EntryDto['game'], 'genres' | 'igdbRating' | 'releaseDate'> };

const DAY_MS = 86_400_000;
const daysSince = (ms: number, now: number) => Math.floor((now - ms) / DAY_MS);

/** The value a number field takes for an entry; null when unknown. */
export function numberFieldValue(
    e: SmartEntry,
    field: SmartNumberField,
    now: number
): number | null {
    switch (field) {
        case 'ttb':
            return e.ttbMinutes;
        case 'igdbScore':
            return e.game.igdbRating;
        case 'rating':
            return e.rating;
        case 'addedDays':
            return daysSince(e.addedAt, now);
        case 'changedDays':
            return daysSince(e.updatedAt, now);
        case 'finishedDays':
            return e.lastFinishedOn
                ? daysSince(Date.parse(`${e.lastFinishedOn}T00:00:00Z`), now)
                : null;
        case 'releaseYear': {
            const year = e.game.releaseDate ? Number(e.game.releaseDate.slice(0, 4)) : NaN;
            return Number.isFinite(year) ? year : null;
        }
    }
}

const lowerSet = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));

export function matchesRule(e: SmartEntry, rule: SmartRule, now: number): boolean {
    switch (rule.field) {
        case 'status':
            return rule.anyOf.includes(e.status);
        case 'platform': {
            const wanted = new Set(rule.anyOf);
            return e.platforms.some((p) => wanted.has(p.id));
        }
        case 'genre': {
            const wanted = lowerSet(rule.anyOf);
            return e.game.genres.some((g) => wanted.has(g.toLowerCase()));
        }
        case 'finishedYear':
            return e.finishedYears.some((y) => rule.anyOf.includes(y));
        case 'tag': {
            const wanted = lowerSet(rule.anyOf);
            return e.tags.some((t) => wanted.has(t.toLowerCase()));
        }
        default: {
            const v = numberFieldValue(e, rule.field, now);
            if (rule.op === 'unknown') return v === null;
            if (v === null) return false;
            return rule.op === 'gte' ? v >= rule.value : v <= rule.value;
        }
    }
}

export const matchesRules = (e: SmartEntry, rules: SmartRule[], now: number) =>
    rules.every((r) => matchesRule(e, r, now));

type Sortable = SmartEntry & { id: number; game: { name: string } };

const sortKey = (e: Sortable, sort: SmartSort): string | number | null => {
    switch (sort) {
        case 'title':
            return e.game.name.toLowerCase();
        case 'added':
            return e.addedAt;
        case 'release':
            return e.game.releaseDate;
        case 'rating':
            return e.rating;
        case 'score':
            return e.game.igdbRating;
        case 'ttb':
            return e.ttbMinutes;
        case 'changed':
            return e.updatedAt;
    }
};

/** Sorts a copy. Missing values come last whichever way it sorts, then title, then id. */
export function sortSmart<T extends Sortable>(entries: T[], sort: SmartSort, dir: SortDir): T[] {
    const sign = dir === 'asc' ? 1 : -1;
    return [...entries].sort((a, b) => {
        const x = sortKey(a, sort);
        const y = sortKey(b, sort);
        if ((x === null) !== (y === null)) return x === null ? 1 : -1;
        if (x !== null && y !== null && x !== y) return (x < y ? -1 : 1) * sign;
        return a.game.name.toLowerCase().localeCompare(b.game.name.toLowerCase()) || a.id - b.id;
    });
}

/** The games matching the rules, sorted. `now` is injectable for tests. */
export function evaluateSmartList<T extends Sortable>(
    entries: T[],
    rules: SmartRule[],
    sort: SmartSort,
    dir: SortDir,
    now: number = Date.now()
): T[] {
    return sortSmart(
        entries.filter((e) => matchesRules(e, rules, now)),
        sort,
        dir
    );
}

// ---------------------------------------------------------------------------
// Describing rules in words
// ---------------------------------------------------------------------------

const joinOr = (xs: string[]) =>
    xs.length <= 2 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;

const hours = (min: number) => (min < 60 ? `${min} min` : `${Number((min / 60).toFixed(1))} h`);

function amount(field: SmartNumberField, value: number): string {
    switch (field) {
        case 'ttb':
            return hours(value);
        case 'igdbScore':
            return String(value);
        case 'rating':
            return `${value} ${value === 1 ? 'star' : 'stars'}`;
        case 'releaseYear':
            return String(value);
        default:
            return `${value} ${value === 1 ? 'day' : 'days'} ago`;
    }
}

/** "Status is unplayed or paused", "Time to beat at most 5 h", … */
export function describeRule(
    rule: SmartRule,
    platformName: (id: number) => string = (id) => `#${id}`
): string {
    switch (rule.field) {
        case 'status':
            return `Status is ${joinOr(rule.anyOf)}`;
        case 'platform':
            return `Platform is ${joinOr(rule.anyOf.map(platformName))}`;
        case 'genre':
            return `Genre is ${joinOr(rule.anyOf)}`;
        case 'tag':
            return `Tagged ${joinOr(rule.anyOf)}`;
        case 'finishedYear':
            return `Finished in ${joinOr(rule.anyOf.map(String))}`;
        default: {
            const label = SMART_NUMBER_FIELD_INFO[rule.field].label;
            if (rule.op === 'unknown') return `${label} is unknown`;
            const word =
                rule.field === 'releaseYear'
                    ? rule.op === 'gte'
                        ? 'in or after'
                        : 'in or before'
                    : rule.op === 'gte'
                      ? 'at least'
                      : 'at most';
            // For "days ago" fields, "at least 30 days ago" reads right as-is.
            return `${label} ${word} ${amount(rule.field, rule.value)}`;
        }
    }
}

export const describeRules = (rules: SmartRule[], platformName?: (id: number) => string) =>
    rules.map((r) => describeRule(r, platformName));

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface SmartListPreset {
    key: string;
    name: string;
    blurb: string;
    rules: SmartRule[];
    sort: SmartSort;
    dir: SortDir;
}

const unplayed: SmartRule = { field: 'status', anyOf: ['unplayed'] as EntryStatus[] };

/** One-click starting points; creating one makes an ordinary, editable smart list. */
export const SMART_LIST_PRESETS: SmartListPreset[] = [
    {
        key: 'quick-wins',
        name: 'Quick wins',
        blurb: 'Unplayed games you can beat in 5 hours or less.',
        rules: [unplayed, { field: 'ttb', op: 'lte', value: 300 }],
        sort: 'ttb',
        dir: 'asc'
    },
    {
        key: 'hidden-gems',
        name: 'Hidden gems',
        blurb: 'Unplayed games IGDB scores 80 or higher.',
        rules: [unplayed, { field: 'igdbScore', op: 'gte', value: 80 }],
        sort: 'score',
        dir: 'desc'
    },
    {
        key: 'long-neglected',
        name: 'Long-neglected',
        blurb: 'Unplayed games that have sat in your collection for over a year.',
        rules: [unplayed, { field: 'addedDays', op: 'gte', value: 365 }],
        sort: 'added',
        dir: 'asc'
    },
    {
        key: 'gathering-dust',
        name: 'Gathering dust',
        blurb: 'Paused games you have not touched in 30 days.',
        rules: [
            { field: 'status', anyOf: ['paused'] },
            { field: 'changedDays', op: 'gte', value: 30 }
        ],
        sort: 'changed',
        dir: 'asc'
    },
    {
        key: 'replay-candidates',
        name: 'Replay candidates',
        blurb: 'Games you finished and rated 4 stars or more, over two years ago.',
        rules: [
            { field: 'status', anyOf: ['finished'] },
            { field: 'rating', op: 'gte', value: 4 },
            { field: 'finishedDays', op: 'gte', value: 730 }
        ],
        sort: 'rating',
        dir: 'desc'
    }
];
