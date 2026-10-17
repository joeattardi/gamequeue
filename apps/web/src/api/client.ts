import type { ApiError } from '@gamequeue/shared';

export class ApiRequestError extends Error {
    constructor(
        message: string,
        public status: number,
        public details?: unknown
    ) {
        super(message);
    }
}

export async function api<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
): Promise<T> {
    const res = await fetch(`/api${path}`, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    });
    const data = (await res.json().catch(() => ({}))) as T & Partial<ApiError>;
    if (!res.ok) throw new ApiRequestError(data.error ?? res.statusText, res.status, data.details);
    return data;
}
