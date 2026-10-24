import { CloudflareError, type CloudflareClient, type CloudflareDay } from './types.js';

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

// Daily groups are available on every plan, and carry unique visitors (the hourly ones don't on Free)
const QUERY = `query Traffic($zoneTag: string!, $since: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 400, filter: { date_geq: $since }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { requests cachedRequests bytes pageViews }
        uniq { uniques }
      }
    }
  }
}`;

interface RawGroup {
    dimensions: { date: string };
    sum: { requests: number; cachedRequests: number; bytes: number; pageViews: number };
    uniq: { uniques: number };
}
interface RawResponse {
    data?: { viewer?: { zones?: { httpRequests1dGroups?: RawGroup[] }[] } } | null;
    errors?: { message: string }[] | null;
}

export interface CloudflareClientOptions {
    /** An API token with Account Analytics: Read (or Zone Analytics: Read) on the zone */
    apiToken: string;
    zoneId: string;
    fetchFn?: typeof fetch;
}

/** Reads the zone's traffic from Cloudflare's GraphQL Analytics API. The token goes in a header, never the URL. */
export function createCloudflareClient(opts: CloudflareClientOptions): CloudflareClient {
    const fetchFn = opts.fetchFn ?? fetch;
    return {
        async dailyTraffic(sinceDay) {
            let res: Response;
            try {
                res = await fetchFn(ENDPOINT, {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${opts.apiToken}`,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: QUERY,
                        variables: { zoneTag: opts.zoneId, since: sinceDay }
                    }),
                    signal: AbortSignal.timeout(10_000)
                });
            } catch (e) {
                throw new CloudflareError(`Cloudflare request failed: ${(e as Error).message}`);
            }
            if (res.status === 401 || res.status === 403)
                throw new CloudflareError(
                    'Cloudflare rejected the API token (it needs Analytics: Read on the zone)',
                    res.status
                );
            if (!res.ok) throw new CloudflareError(`Cloudflare answered ${res.status}`, res.status);
            const body = (await res.json().catch(() => null)) as RawResponse | null;
            if (!body) throw new CloudflareError('Cloudflare sent an unreadable response');
            if (body.errors?.length)
                throw new CloudflareError(`Cloudflare: ${body.errors[0]!.message}`);
            const zone = body.data?.viewer?.zones?.[0];
            if (!zone)
                throw new CloudflareError(
                    'Cloudflare found no such zone for this token (check CLOUDFLARE_ZONE_ID)'
                );
            return (zone.httpRequests1dGroups ?? []).map((g): CloudflareDay => ({
                day: g.dimensions.date,
                requests: g.sum.requests,
                cachedRequests: g.sum.cachedRequests,
                pageViews: g.sum.pageViews,
                uniques: g.uniq.uniques,
                bytes: g.sum.bytes
            }));
        }
    };
}
