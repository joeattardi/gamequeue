import { TRAFFIC_DAYS, type TrafficDayDto, type TrafficDto } from '@gamequeue/shared';
import { CloudflareError, type CloudflareClient } from '../cloudflare/types.js';
import { HttpError } from '../errors.js';
import { TtlCache } from '../igdb/search-cache.js';

/** Cloudflare's numbers move slowly and the admin page refetches on focus, so keep them a few minutes. */
export const trafficCache = () => new TtlCache<TrafficDto>(5 * 60_000, 1);

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The last `TRAFFIC_DAYS` UTC days of traffic, oldest first, with days Cloudflare has nothing for
 * filled in as zeros so a chart is never missing a column. Without a client: `{enabled: false}`.
 */
export async function getTraffic(
    cloudflare: CloudflareClient | undefined,
    cache: TtlCache<TrafficDto>,
    now = Date.now()
): Promise<TrafficDto> {
    if (!cloudflare) return { enabled: false, days: [], fetchedAt: null };
    const hit = cache.get('traffic');
    if (hit) return hit;

    const start = now - (TRAFFIC_DAYS - 1) * DAY_MS;
    let rows;
    try {
        rows = await cloudflare.dailyTraffic(isoDay(start));
    } catch (e) {
        if (e instanceof CloudflareError) throw new HttpError(502, e.message);
        throw e;
    }
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const days: TrafficDayDto[] = Array.from({ length: TRAFFIC_DAYS }, (_, i) => {
        const day = isoDay(start + i * DAY_MS);
        const r = byDay.get(day);
        const requests = r?.requests ?? 0;
        const cached = Math.min(r?.cachedRequests ?? 0, requests);
        return {
            day,
            requests,
            cached,
            uncached: requests - cached,
            pageViews: r?.pageViews ?? 0,
            uniques: r?.uniques ?? 0,
            bytes: r?.bytes ?? 0
        };
    });
    const traffic: TrafficDto = { enabled: true, days, fetchedAt: now };
    cache.set('traffic', traffic);
    return traffic;
}
