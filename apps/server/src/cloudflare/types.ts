/** One UTC day of edge traffic, as Cloudflare reports it. */
export interface CloudflareDay {
    /** `YYYY-MM-DD` */
    day: string;
    requests: number;
    cachedRequests: number;
    pageViews: number;
    uniques: number;
    bytes: number;
}

export interface CloudflareClient {
    /** Daily totals from `sinceDay` (`YYYY-MM-DD`, UTC) through today. Days with no traffic are absent. */
    dailyTraffic(sinceDay: string): Promise<CloudflareDay[]>;
}

export class CloudflareError extends Error {
    constructor(
        message: string,
        public status?: number
    ) {
        super(message);
    }
}
