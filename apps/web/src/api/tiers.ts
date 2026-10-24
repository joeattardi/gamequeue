import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AddTierInput,
    AddTierItemInput,
    MoveTierItemInput,
    PatchTierInput,
    PatchTierListInput,
    PublicTierListDto,
    TierListDto,
    TierListSummaryDto
} from '@gamequeue/shared';
import { api } from './client';

type Wrapped = { tierList: TierListDto };

export const useTierLists = () =>
    useQuery({
        queryKey: ['tier-lists'],
        queryFn: async () =>
            (await api<{ tierLists: TierListSummaryDto[] }>('/tier-lists')).tierLists
    });

export const useTierList = (id: number) =>
    useQuery({
        queryKey: ['tier-list', id],
        queryFn: async () => (await api<Wrapped>(`/tier-lists/${id}`)).tierList,
        retry: false
    });

/** Anyone's tier list; no login needed. */
export const usePublicTierList = (username: string, id: number) =>
    useQuery({
        queryKey: ['profile', username, 'tier-list', id],
        queryFn: async () =>
            (await api<{ tierList: PublicTierListDto }>(`/profiles/${username}/tier-lists/${id}`))
                .tierList,
        retry: false
    });

/** After a change: keep this list's cache current and refresh the tiles that show it. */
function useAfterChange() {
    const qc = useQueryClient();
    return (list: TierListDto) => {
        qc.setQueryData(['tier-list', list.id], list);
        void qc.invalidateQueries({ queryKey: ['tier-lists'] });
        void qc.invalidateQueries({ queryKey: ['profile'] });
    };
}

export function useCreateTierList() {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (input: { title: string; description?: string }) =>
            (await api<Wrapped>('/tier-lists', { method: 'POST', body: input })).tierList,
        onSuccess: after
    });
}

export function usePatchTierList(id: number) {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (patch: PatchTierListInput) =>
            (await api<Wrapped>(`/tier-lists/${id}`, { method: 'PATCH', body: patch })).tierList,
        onSuccess: after
    });
}

export function useDeleteTierList() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api(`/tier-lists/${id}`, { method: 'DELETE' }),
        onSuccess: (_, id) => {
            qc.removeQueries({ queryKey: ['tier-list', id] });
            void qc.invalidateQueries({ queryKey: ['tier-lists'] });
            void qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

/** One mutation hook for every edit of a list's tiers and games; each returns the new list. */
export function useTierEdits(id: number) {
    const after = useAfterChange();
    const run = (path: string, method: string, body?: unknown) =>
        api<Wrapped>(`/tier-lists/${id}${path}`, { method, body }).then((r) => r.tierList);
    const opts = { onSuccess: after };
    return {
        addTier: useMutation({
            mutationFn: (v: AddTierInput) => run('/tiers', 'POST', v),
            ...opts
        }),
        patchTier: useMutation({
            mutationFn: (v: { tierId: number; patch: PatchTierInput }) =>
                run(`/tiers/${v.tierId}`, 'PATCH', v.patch),
            ...opts
        }),
        deleteTier: useMutation({
            mutationFn: (tierId: number) => run(`/tiers/${tierId}`, 'DELETE'),
            ...opts
        }),
        reorderTiers: useMutation({
            mutationFn: (tierIds: number[]) => run('/tiers/order', 'PUT', { tierIds }),
            ...opts
        }),
        addItem: useMutation({
            mutationFn: (v: AddTierItemInput) => run('/items', 'POST', v),
            ...opts
        }),
        moveItem: useMutation({
            mutationFn: (v: MoveTierItemInput) => run('/items/move', 'PUT', v),
            ...opts
        }),
        removeItem: useMutation({
            mutationFn: (igdbId: number) => run(`/items/${igdbId}`, 'DELETE'),
            ...opts
        })
    };
}
