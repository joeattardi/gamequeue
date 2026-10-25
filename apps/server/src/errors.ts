export class HttpError extends Error {
    constructor(
        public status: 400 | 403 | 429 | 404 | 409 | 502 | 503,
        message: string,
        public extra?: Record<string, unknown>
    ) {
        super(message);
    }
}
