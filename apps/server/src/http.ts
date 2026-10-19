import type { ZodType } from 'zod';
import { HttpError } from './errors.js';

/** Validates input with a shared Zod schema; failures become a 400 with per-field details. */
export function validate<T>(schema: ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    throw new HttpError(400, 'Invalid input', {
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
}

export function parseId(raw: string | undefined): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Not found');
    return id;
}

/** A CSV download named after what it holds ("Quick wins" -> quick-wins.csv, with the real name as filename*). */
export function csvResponse(
    c: { body(data: string, status: 200, headers: Record<string, string>): Response },
    name: string,
    csv: string
): Response {
    const slug =
        name
            .normalize('NFKD')
            .replace(/[^\x20-\x7e]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'gamequeue';
    return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${slug}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
        'Cache-Control': 'no-store'
    });
}
