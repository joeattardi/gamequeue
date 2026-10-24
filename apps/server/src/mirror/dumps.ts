import { Readable } from 'node:stream';
import { TokenError, TokenProvider } from '../igdb/token.js';
import { PermanentMirrorError } from './errors.js';

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

/** Waits before the 2nd and 3rd try of one request. */
const REQUEST_RETRY_MS = [1000, 4000];

/** Worth another try: a timeout, a rate limit or a server-side failure. Other 4xx will never work. */
const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

/** An error for a bad answer: permanent for a client error such as 401, 403 or 404, else retryable. */
const statusError = (message: string, status: number) =>
    isTransient(status) ? new DumpError(message) : new PermanentMirrorError(message);

/** IGDB's partner data dumps (`GET /v4/dumps`, `GET /v4/dumps/{endpoint}` -> `s3_url`). */
export function createDumpSource(opts: {
    clientId: string;
    clientSecret: string;
    fetchFn?: typeof fetch;
    /** Waits before each retry of a request (default `REQUEST_RETRY_MS`); tests pass none */
    retryDelaysMs?: number[];
    sleep?: (ms: number) => Promise<void>;
}): DumpSource {
    const baseFetch = opts.fetchFn ?? fetch;
    const delays = opts.retryDelaysMs ?? REQUEST_RETRY_MS;
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    /** A request that is tried again on a network error, a 408, a 429 or a 5xx, then gives up. */
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
        for (let attempt = 0; ; attempt++) {
            const wait = delays[attempt];
            try {
                const res = await baseFetch(url, init);
                if (res.ok || !isTransient(res.status) || wait === undefined) return res;
            } catch (e) {
                if (wait === undefined) throw e;
            }
            await sleep(wait);
        }
    };
    const tokens = new TokenProvider(opts.clientId, opts.clientSecret, baseFetch);
    const headers = async () => {
        let token: string;
        try {
            token = await tokens.get();
        } catch (e) {
            // A refused secret (400/401/403) will be refused again; an outage or a 429 may pass
            if (e instanceof TokenError && !isTransient(e.status))
                throw new PermanentMirrorError(e.message);
            throw e;
        }
        return { 'Client-ID': opts.clientId, Authorization: `Bearer ${token}` };
    };

    return {
        async list() {
            const res = await fetchFn(`${BASE}/dumps`, { headers: await headers() });
            if (!res.ok) throw statusError(`Listing IGDB dumps failed (${res.status})`, res.status);
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
            if (!info.ok)
                throw statusError(
                    `Dump ${endpoint} is not available (${info.status})`,
                    info.status
                );
            const { s3_url } = (await info.json()) as { s3_url?: string };
            if (!s3_url) throw new DumpError(`Dump ${endpoint} has no download URL`);
            const file = await fetchFn(s3_url);
            if (!file.ok || !file.body)
                throw statusError(
                    `Downloading dump ${endpoint} failed (${file.status})`,
                    file.status
                );
            return Readable.fromWeb(file.body as Parameters<typeof Readable.fromWeb>[0]);
        }
    };
}
