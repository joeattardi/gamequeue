import { useInfiniteQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@gamequeue/shared';
import { api } from './client';

interface PageOf<T> {
    items: T[];
    total: number;
}

/** `?limit=&offset=` appended to a path that may already have a query string. */
export const withPage = (path: string, offset: number, limit = DEFAULT_PAGE_SIZE) =>
    `${path}${path.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`;

/**
 * A list that loads one page at a time ("Load more"). `load` fetches the page starting at
 * `offset` and says how to read items and the overall total out of the response. Pages are
 * contiguous from the start, so the number of items loaded is also the next offset, and the
 * absolute index of any loaded item is its index in `items`.
 */
export function usePagedQuery<R, T>(opts: {
    key: readonly unknown[];
    load: (offset: number, limit: number) => Promise<R>;
    read: (response: R) => PageOf<T>;
    limit?: number;
    enabled?: boolean;
    retry?: boolean;
    placeholder?: boolean;
}) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const query = useInfiniteQuery({
        queryKey: opts.key,
        queryFn: ({ pageParam }) => opts.load(pageParam, limit),
        initialPageParam: 0,
        getNextPageParam: (last, all) => {
            const loaded = all.reduce((n, p) => n + opts.read(p).items.length, 0);
            return loaded < opts.read(last).total && opts.read(last).items.length > 0
                ? loaded
                : undefined;
        },
        enabled: opts.enabled,
        retry: opts.retry,
        placeholderData: opts.placeholder ? (prev) => prev : undefined
    });
    // Memoised: pages put these in effect dependencies (e.g. to reset a drag-and-drop order)
    const items = useMemo(
        () => query.data?.pages.flatMap((p) => opts.read(p).items) ?? [],
        // `read` only picks fields, so it is the same for every render of a given hook
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [query.data]
    );
    const total = query.data ? opts.read(query.data.pages[0]!).total : undefined;
    // The first page also carries the list's own fields (name, years…), so expose it whole
    return { ...query, items, total, head: query.data?.pages[0] };
}

/** Every page of something, for the few places that genuinely need all of it (e.g. "add this whole list"). */
export async function fetchAll<R, T>(
    queryClient: QueryClient,
    key: readonly unknown[],
    path: string,
    read: (response: R) => PageOf<T>
): Promise<T[]> {
    const out: T[] = [];
    for (;;) {
        const page = read(
            await queryClient.fetchQuery({
                queryKey: [...key, 'all', out.length],
                queryFn: () => api<R>(withPage(path, out.length, MAX_PAGE_SIZE)),
                staleTime: 0
            })
        );
        out.push(...page.items);
        if (page.items.length === 0 || out.length >= page.total) return out;
    }
}
