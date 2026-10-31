import { useMutation } from '@tanstack/react-query';
import type { ListDetailDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';
import { usePagedQuery, withPage } from './paging';

/** The queue a page at a time. `limit` is for previews (home page, pickers). */
export const useQueue = (limit?: number) =>
    usePagedQuery({
        key: ['queue', limit ?? null],
        load: async (offset, size) =>
            (await api<{ list: ListDetailDto }>(withPage('/queue', offset, size))).list,
        read: (l) => ({ items: l.items, total: l.total }),
        limit
    });

export function useAddToQueue() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (igdbId: number) => api('/queue/items', { method: 'POST', body: { igdbId } }),
        onSuccess: invalidate
    });
}

export function useRemoveFromQueue() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (igdbId: number) => api(`/queue/items/${igdbId}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}
