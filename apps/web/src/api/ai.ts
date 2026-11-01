import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AdminAiDto,
    AiChatInput,
    AiDraftDto,
    AiReplyDto,
    AiStatusDto,
    AiSummarizeInput
} from '@gamequeue/shared';
import { api } from './client';

export const useAiStatus = () =>
    useQuery({
        queryKey: ['ai', 'status'],
        queryFn: () => api<AiStatusDto>('/ai/status'),
        staleTime: 60_000
    });

/** A failed call may mean the budget just ran out, so the status is checked again afterwards. */
export function useAiChat() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AiChatInput) =>
            api<AiReplyDto>('/ai/chat', { method: 'POST', body: input }),
        onSettled: () => qc.invalidateQueries({ queryKey: ['ai', 'status'] })
    });
}

export function useAiSummarize() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AiSummarizeInput) =>
            api<AiDraftDto>('/ai/summarize', { method: 'POST', body: input }),
        onSettled: () => qc.invalidateQueries({ queryKey: ['ai', 'status'] })
    });
}

export const useAdminAi = () =>
    useQuery({
        queryKey: ['admin', 'ai'],
        queryFn: () => api<AdminAiDto>('/admin/ai'),
        refetchOnWindowFocus: true
    });

export function useSetAiBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (budgetUsd: number) =>
            api<AdminAiDto>('/admin/ai/budget', { method: 'PUT', body: { budgetUsd } }),
        onSuccess: (data) => qc.setQueryData(['admin', 'ai'], data)
    });
}
