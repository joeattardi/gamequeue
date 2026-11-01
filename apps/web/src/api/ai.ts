import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AdminAiDto,
    AiChatInput,
    AiDraftDto,
    AiStatusDto,
    AiSummarizeInput
} from '@gamequeue/shared';
import { api, ApiRequestError } from './client';

export const useAiStatus = () =>
    useQuery({
        queryKey: ['ai', 'status'],
        queryFn: () => api<AiStatusDto>('/ai/status'),
        staleTime: 60_000
    });

/**
 * One helper turn, streamed: `onDelta` gets each piece of the answer as it arrives, and the
 * promise resolves with the whole answer (which wins over the pieces). Refusals before the answer
 * starts come back as an ordinary error response.
 */
export async function streamChat(input: AiChatInput, onDelta: (text: string) => void) {
    const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(input)
    });
    if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiRequestError(data.error ?? res.statusText, res.status);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        // Server-sent events are separated by a blank line
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: ?(.*)$/m.exec(block)?.[1];
            const raw = block
                .split('\n')
                .filter((l) => l.startsWith('data:'))
                .map((l) => l.replace(/^data: ?/, ''))
                .join('\n');
            if (!raw) continue;
            const data = JSON.parse(raw) as { text?: string; reply?: string; error?: string };
            if (event === 'delta' && data.text) onDelta(data.text);
            if (event === 'done') return data.reply ?? '';
            if (event === 'error')
                throw new ApiRequestError(data.error ?? 'The AI didn’t answer.', 502);
        }
    }
    throw new ApiRequestError('The answer was cut off. Try again.', 502);
}

/** A failed call may mean the budget just ran out, so the status is checked again afterwards. */
export function useAiChat() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { input: AiChatInput; onDelta: (text: string) => void }) =>
            streamChat(v.input, v.onDelta),
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
