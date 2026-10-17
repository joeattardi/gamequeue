import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignSlotInput, EntryDto, SlotDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';

export const useSlots = () =>
    useQuery({
        queryKey: ['slots'],
        queryFn: async () => (await api<{ slots: SlotDto[] }>('/slots')).slots
    });

/** Slot mutations return the whole slot list; assigning also changes games, so refresh everything. */
function useSlotMutation<V>(fn: (v: V) => Promise<{ slots: SlotDto[] }>) {
    const qc = useQueryClient();
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: fn,
        onSuccess: async (res) => {
            qc.setQueryData(['slots'], res.slots);
            await invalidate();
        }
    });
}

export const useAssignSlot = () =>
    useSlotMutation((v: { slotId: number; body: AssignSlotInput }) =>
        api(`/slots/${v.slotId}/entry`, { method: 'PUT', body: v.body })
    );

export const useClearSlot = () =>
    useSlotMutation((slotId: number) => api(`/slots/${slotId}/entry`, { method: 'DELETE' }));

export const useCreateSlot = () =>
    useSlotMutation((name: string) => api('/slots', { method: 'POST', body: { name } }));

export const useRenameSlot = () =>
    useSlotMutation((v: { slotId: number; name: string }) =>
        api(`/slots/${v.slotId}`, { method: 'PATCH', body: { name: v.name } })
    );

export const useDeleteSlot = () =>
    useSlotMutation((slotId: number) => api(`/slots/${slotId}`, { method: 'DELETE' }));

export const useReorderSlots = () =>
    useSlotMutation((ids: number[]) => api('/slots/order', { method: 'PUT', body: { ids } }));

/** True when starting this game needs the user to say which platform they're playing it on. */
export const needsPlatform = (e: EntryDto) =>
    e.platforms.length > 1 && e.status !== 'playing' && e.status !== 'paused';
