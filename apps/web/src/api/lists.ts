import { useMutation, useQuery } from '@tanstack/react-query';
import type {
    ListDetailDto,
    ListSummaryDto,
    PatchListInput,
    PickInput,
    PickResultDto
} from '@gamequeue/shared';
import { api } from './client';
import { usePagedQuery, withPage } from './paging';
import { useInvalidateAfterDelete, useInvalidateCollection } from './collection';

export const useLists = () =>
    useQuery({
        queryKey: ['lists'],
        queryFn: async () => (await api<{ lists: ListSummaryDto[] }>('/lists')).lists
    });

/** A list a page at a time. `name` and `kind` come with every page; `total` is the whole list. */
export const useList = (id: number) =>
    usePagedQuery({
        key: ['list', id],
        load: async (offset, limit) =>
            (await api<{ list: ListDetailDto }>(withPage(`/lists/${id}`, offset, limit))).list,
        read: (l) => ({ items: l.entries, total: l.total }),
        retry: false
    });

export function useCreateList() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (input: { name: string; description?: string }) =>
            (await api<{ list: ListSummaryDto }>('/lists', { method: 'POST', body: input })).list,
        onSuccess: invalidate
    });
}

export function useUpdateList(id: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (patch: PatchListInput) =>
            api(`/lists/${id}`, { method: 'PATCH', body: patch }),
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

/** Moves one game to an absolute position, so it works with only the first pages loaded. */
export function useMoveInList(listId: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (v: { entryId: number; toIndex: number }) =>
            api(`/lists/${listId}/move`, { method: 'PUT', body: v }),
        // Refetch either way so the UI snaps back to the server's order if the save failed
        onSettled: invalidate
    });
}

export const usePick = () =>
    useMutation({
        mutationFn: (input: PickInput) =>
            api<PickResultDto>('/pick', { method: 'POST', body: input })
    });
