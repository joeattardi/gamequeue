import { Readable } from 'node:stream';
import { TokenProvider } from '../igdb/token.js';

const BASE = 'https://api.igdb.com/v4';

export interface DumpInfo {
    endpoint: string;
    fileName: string;
    /** Unix seconds */
    updatedAt: number;
}

/** Where the dump CSVs come from: IGDB in production, fixtures in tests. */
export interface DumpSource {
    list(): Promise<DumpInfo[]>;
    /** The CSV of one endpoint as a stream. The download URL is short-lived, so open it right before reading. */
    open(endpoint: string): Promise<Readable>;
}

export class DumpError extends Error {}

/** IGDB's partner data dumps (`GET /v4/dumps`, `GET /v4/dumps/{endpoint}` -> `s3_url`). */
export function createDumpSource(opts: {
    clientId: string;
    clientSecret: string;
    fetchFn?: typeof fetch;
}): DumpSource {
    const fetchFn = opts.fetchFn ?? fetch;
    const tokens = new TokenProvider(opts.clientId, opts.clientSecret, fetchFn);
    const headers = async () => ({
        'Client-ID': opts.clientId,
        Authorization: `Bearer ${await tokens.get()}`
    });

    return {
        async list() {
            const res = await fetchFn(`${BASE}/dumps`, { headers: await headers() });
            if (!res.ok) throw new DumpError(`Listing IGDB dumps failed (${res.status})`);
            const rows = (await res.json()) as {
                endpoint: string;
                file_name: string;
                updated_at: number;
            }[];
            return rows.map((r) => ({
                endpoint: r.endpoint,
                fileName: r.file_name,
                updatedAt: r.updated_at
            }));
        },

        async open(endpoint) {
            const info = await fetchFn(`${BASE}/dumps/${encodeURIComponent(endpoint)}`, {
                headers: await headers()
            });
            if (!info.ok) throw new DumpError(`Dump ${endpoint} is not available (${info.status})`);
            const { s3_url } = (await info.json()) as { s3_url?: string };
            if (!s3_url) throw new DumpError(`Dump ${endpoint} has no download URL`);
            const file = await fetchFn(s3_url);
            if (!file.ok || !file.body)
                throw new DumpError(`Downloading dump ${endpoint} failed (${file.status})`);
            return Readable.fromWeb(file.body as Parameters<typeof Readable.fromWeb>[0]);
        }
    };
}
