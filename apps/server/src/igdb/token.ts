const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REFRESH_MARGIN_MS = 3600_000; // refresh an hour before expiry

type FetchFn = typeof fetch;

/** The Twitch token request failed; `status` is the HTTP status, so callers can tell a bad secret (4xx) from an outage. */
export class TokenError extends Error {
    constructor(
        message: string,
        public status: number
    ) {
        super(message);
    }
}

/** Twitch client-credentials token, cached in memory and refreshed ahead of expiry. */
export class TokenProvider {
    private token?: { value: string; expiresAt: number };
    private inflight?: Promise<string>;

    constructor(
        private clientId: string,
        private clientSecret: string,
        private fetchFn: FetchFn = fetch,
        private now: () => number = Date.now
    ) {}

    async get(): Promise<string> {
        if (this.token && this.now() < this.token.expiresAt - REFRESH_MARGIN_MS)
            return this.token.value;
        // Concurrent callers share one refresh
        return (this.inflight ??= this.refresh().finally(() => (this.inflight = undefined)));
    }

    /** Whether a cached token exists and hasn't expired (it may still be refreshed early). */
    status(): { valid: boolean; expiresAt: number | null } {
        const t = this.token;
        return { valid: !!t && this.now() < t.expiresAt, expiresAt: t?.expiresAt ?? null };
    }

    /** Call after a 401 so the next get() fetches a fresh token. */
    invalidate() {
        this.token = undefined;
    }

    private async refresh(): Promise<string> {
        const url = `${TOKEN_URL}?${new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials'
        })}`;
        const res = await this.fetchFn(url, { method: 'POST' });
        if (!res.ok)
            throw new TokenError(`Twitch token request failed (${res.status})`, res.status);
        const body = (await res.json()) as { access_token: string; expires_in: number };
        this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
        return body.access_token;
    }
}
