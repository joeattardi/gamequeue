import { useMutation, useQuery } from '@tanstack/react-query';
import type { SmartListDetailDto, SmartListInput, SmartListSummaryDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateAfterDelete, useInvalidateCollection } from './collection';

export const useSmartLists = () =>
    useQuery({
        queryKey: ['smartLists'],
        queryFn: async () =>
            (await api<{ smartLists: SmartListSummaryDto[] }>('/smart-lists')).smartLists
    });

export const useSmartList = (id: number) =>
    useQuery({
        queryKey: ['smartList', id],
        queryFn: async () =>
            (await api<{ smartList: SmartListDetailDto }>(`/smart-lists/${id}`)).smartList
    });

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
