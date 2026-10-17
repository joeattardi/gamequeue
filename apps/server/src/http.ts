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
