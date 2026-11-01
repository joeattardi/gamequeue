export class HttpError extends Error {
    constructor(
        public status: 400 | 403 | 429 | 404 | 409 | 413 | 415 | 502 | 503 | 507,
        message: string,
        public extra?: Record<string, unknown>
    ) {
        super(message);
    }
}
