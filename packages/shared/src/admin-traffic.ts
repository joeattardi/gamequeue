/** Days of traffic history on the admin Traffic page (today, in UTC, included). */
export const TRAFFIC_DAYS = 30;

/** One UTC day of what Cloudflare's edge served for the site. */
export interface TrafficDayDto {
    /** `YYYY-MM-DD`, UTC */
    day: string;
    requests: number;
    /** Requests Cloudflare answered from its cache; `cached + uncached = requests` */
    cached: number;
    uncached: number;
    pageViews: number;
    /** Unique visitors that day (by IP). Days can't be added up: someone returning counts each day */
    uniques: number;
    /** Bytes sent to visitors */
    bytes: number;
}

/** `GET /api/admin/traffic`. `enabled` is false when the Cloudflare token or zone isn't configured. */
export interface TrafficDto {
    enabled: boolean;
    /** Oldest first, one per day with the gaps filled with zeros; empty when not enabled */
    days: TrafficDayDto[];
    /** When Cloudflare was asked (ms since epoch); null when not enabled */
    fetchedAt: number | null;
}

export interface TrafficTotals {
    requests: number;
    pageViews: number;
    bytes: number;
    /** Share of requests Cloudflare answered from cache, 0-100; null when there were no requests */
    cachedPercent: number | null;
    /** Mean of the days' unique visitors (they can't be added up), rounded */
    avgVisitors: number;
}

/** Sums the last `count` days (the newest ones; the list is oldest first). */
export function trafficTotals(days: TrafficDayDto[], count: number): TrafficTotals {
    const last = days.slice(-count);
    const sum = (f: (d: TrafficDayDto) => number) => last.reduce((n, d) => n + f(d), 0);
    const requests = sum((d) => d.requests);
    return {
        requests,
        pageViews: sum((d) => d.pageViews),
        bytes: sum((d) => d.bytes),
        cachedPercent: requests === 0 ? null : Math.round((sum((d) => d.cached) / requests) * 100),
        avgVisitors: last.length === 0 ? 0 : Math.round(sum((d) => d.uniques) / last.length)
    };
}
