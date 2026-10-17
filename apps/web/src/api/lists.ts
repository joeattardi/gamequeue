import { useMutation, useQuery } from '@tanstack/react-query';
import type { ListDetailDto, ListSummaryDto, PickInput, PickResultDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateAfterDelete, useInvalidateCollection } from './collection';

export const useLists = () =>
    useQuery({
        queryKey: ['lists'],
        queryFn: async () => (await api<{ lists: ListSummaryDto[] }>('/lists')).lists
    });

export const useList = (id: number) =>
    useQuery({
        queryKey: ['list', id],
        queryFn: async () => (await api<{ list: ListDetailDto }>(`/lists/${id}`)).list
    });

export function useCreateList() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (name: string) =>
            (await api<{ list: ListSummaryDto }>('/lists', { method: 'POST', body: { name } }))
                .list,
        onSuccess: invalidate
    });
}

export function useRenameList(id: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (name: string) => api(`/lists/${id}`, { method: 'PATCH', body: { name } }),
        onSuccess: invalidate
    });
}

export function useDeleteList(id: number) {
    const invalidate = useInvalidateAfterDelete(['list', id]);
    return useMutation({
        mutationFn: () => api(`/lists/${id}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}

export function useAddToList() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (v: { listId: number; entryId: number }) =>
            api(`/lists/${v.listId}/items`, { method: 'POST', body: { entryId: v.entryId } }),
        onSuccess: invalidate
    });
}

export function useRemoveFromList() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (v: { listId: number; entryId: number }) =>
            api(`/lists/${v.listId}/items/${v.entryId}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}

export function useReorderList(listId: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (entryIds: number[]) =>
            api(`/lists/${listId}/order`, { method: 'PUT', body: { entryIds } }),
        // Refetch either way so the UI snaps back to the server's order if the save failed
        onSettled: invalidate
    });
}

export const usePick = () =>
    useMutation({
        mutationFn: (input: PickInput) =>
            api<PickResultDto>('/pick', { method: 'POST', body: input })
    });
