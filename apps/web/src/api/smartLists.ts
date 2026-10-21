import { useMutation, useQuery } from '@tanstack/react-query';
import type {
    EntriesPageDto,
    SmartListDetailDto,
    SmartListInput,
    SmartListPreviewInput,
    SmartListSummaryDto
} from '@gamequeue/shared';
import { api } from './client';
import { usePagedQuery, withPage } from './paging';
import { useInvalidateAfterDelete, useInvalidateCollection } from './collection';

export const useSmartLists = () =>
    useQuery({
        queryKey: ['smartLists'],
        queryFn: async () =>
            (await api<{ smartLists: SmartListSummaryDto[] }>('/smart-lists')).smartLists
    });

/** A smart list's matches a page at a time; `total` is every match right now. */
export const useSmartList = (id: number) =>
    usePagedQuery({
        key: ['smartList', id],
        load: async (offset, limit) =>
            (
                await api<{ smartList: SmartListDetailDto }>(
                    withPage(`/smart-lists/${id}`, offset, limit)
                )
            ).smartList,
        read: (l) => ({ items: l.entries, total: l.total }),
        retry: false,
        enabled: id > 0
    });

/** What unsaved rules would match (the editor's live preview), a page at a time. */
export function useSmartListPreview(input: SmartListPreviewInput, enabled: boolean) {
    return usePagedQuery({
        key: ['smartList', 'preview', JSON.stringify(input)],
        load: (offset, limit) =>
            api<EntriesPageDto>(withPage('/smart-lists/preview', offset, limit), {
                method: 'POST',
                body: input
            }),
        read: (r) => ({ items: r.entries, total: r.total }),
        limit: 12,
        enabled,
        placeholder: true
    });
}

export function useCreateSmartList() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (input: SmartListInput) =>
            (
                await api<{ smartList: SmartListDetailDto }>('/smart-lists', {
                    method: 'POST',
                    body: input
                })
            ).smartList,
        onSuccess: invalidate
    });
}

export function useUpdateSmartList(id: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (input: SmartListInput) =>
            (
                await api<{ smartList: SmartListDetailDto }>(`/smart-lists/${id}`, {
                    method: 'PUT',
                    body: input
                })
            ).smartList,
        onSuccess: invalidate
    });
}

export function useDeleteSmartList(id: number) {
    const invalidate = useInvalidateAfterDelete(['smartList', id]);
    return useMutation({
        mutationFn: () => api(`/smart-lists/${id}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}
