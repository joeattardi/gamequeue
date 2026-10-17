import { useMutation, useQuery } from '@tanstack/react-query';
import type { ListDetailDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';

export const useQueue = () =>
    useQuery({
        queryKey: ['queue'],
        queryFn: async () => (await api<{ list: ListDetailDto }>('/queue')).list
    });

export function useAddToQueue() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (entryId: number) => api('/queue/items', { method: 'POST', body: { entryId } }),
        onSuccess: invalidate
    });
}

export function useRemoveFromQueue() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (entryId: number) => api(`/queue/items/${entryId}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}
