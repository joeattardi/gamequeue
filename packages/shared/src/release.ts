import { z } from 'zod';

/**
 * How exactly IGDB knows a release date. IGDB stores one timestamp either way, and for a year,
 * quarter or month it is a placeholder (the Witcher IV's "2028" is 2028-12-31), so the precision
 * says how much of the date to believe. `null` precision with a date means unknown: shown as a day.
 */
export const RELEASE_PRECISIONS = ['day', 'month', 'quarter', 'year'] as const;
export type ReleasePrecision = (typeof RELEASE_PRECISIONS)[number];
export const releasePrecisionSchema = z.enum(RELEASE_PRECISIONS);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parts = (date: string) => ({
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10))
});

/** The last day (YYYY-MM-DD) the release could still land on, given how precise the date is. */
export function releasePeriodEnd(date: string, precision: ReleasePrecision | null): string {
    const { y, m } = parts(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (precision === 'year') return `${y}-12-31`;
    const endMonth = precision === 'quarter' ? Math.ceil(m / 3) * 3 : m;
    if (precision === 'month' || precision === 'quarter') {
        const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
        return `${y}-${pad(endMonth)}-${pad(lastDay)}`;
    }
    return date;
}

/** Out already: no date means not announced, a vague date counts once its whole period is over. */
export function isReleased(
    date: string | null,
    precision: ReleasePrecision | null,
    today: string
): boolean {
    return date !== null && releasePeriodEnd(date, precision) <= today;
}

/** "Nov 19, 2026", "Nov 2026", "Q4 2027", "2028", or "TBA" when there is no date. */
export function releaseLabel(date: string | null, precision: ReleasePrecision | null): string {
    if (!date) return 'TBA';
    const { y, m, d } = parts(date);
    switch (precision) {
        case 'year':
            return String(y);
        case 'quarter':
            return `Q${Math.ceil(m / 3)} ${y}`;
        case 'month':
            return `${MONTHS[m - 1]} ${y}`;
        default:
            return `${MONTHS[m - 1]} ${d}, ${y}`;
    }
}

const DAY_MS = 86_400_000;
const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/** "today", "tomorrow", "in 6 days", "in 3 weeks", "in 3 months", "in 2 years" for a day count ahead. */
export function relativeDays(days: number): string {
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    const plural = (n: number, unit: string) => `in ${n} ${unit}${n === 1 ? '' : 's'}`;
    if (days < 14) return plural(days, 'day');
    if (days < 56) return plural(Math.round(days / 7), 'week');
    const months = Math.round(days / 30.44);
    if (months < 12) return plural(months, 'month');
    return plural(Math.round(days / 365.25), 'year');
}

/**
 * What to say about a game that isn't out yet, for a badge: how long to wait when the day is
 * known, otherwise the vague date itself ("Q4 2027", "2028", "TBA") since a day count would claim
 * too much. Null once the game is released.
 */
export function releaseBadge(
    date: string | null,
    precision: ReleasePrecision | null,
    today: string
): string | null {
    if (isReleased(date, precision, today)) return null;
    if (date && (precision === null || precision === 'day'))
        return relativeDays(Math.round(toDay(date) - toDay(today)));
    return releaseLabel(date, precision);
}

/**
 * Whether a game lands within the next `days` days, today included. Only an exact day counts: a
 * month, quarter or year placeholder says nothing about when in the period it comes out.
 */
export function releasesWithin(
    date: string | null,
    precision: ReleasePrecision | null,
    today: string,
    days: number
): boolean {
    if (!date || (precision !== null && precision !== 'day')) return false;
    const away = toDay(date) - toDay(today);
    return away >= 0 && away <= days;
}
