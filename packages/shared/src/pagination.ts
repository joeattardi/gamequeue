import { z } from 'zod';

/** Rows per page when the client doesn't ask for a size. */
export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 200;

/** `?limit=&offset=`: every list endpoint takes these and answers with the page plus a `total`. */
export const pageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0)
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const FIRST_PAGE: PageQuery = { limit: DEFAULT_PAGE_SIZE, offset: 0 };

/** Moves one item of an ordered list (queue, list, wishlist) to an absolute index. */
export const moveItemSchema = z.object({ toIndex: z.number().int().min(0) });
