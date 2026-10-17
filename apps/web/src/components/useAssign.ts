import type { EntryDto, SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { ApiRequestError } from '../api/client';
import { useAssignSlot } from '../api/slots';
import { useConfirm } from './Confirm';
import { todayLocal } from '../lib';

/**
 * Puts a game in a slot, asking first if that would replace another game
 * (the replaced one is paused, never lost).
 */
export function useAssign() {
    const assign = useAssignSlot();
    const confirm = useConfirm();
    const [error, setError] = useState<string>();

    async function assignTo(
        slot: SlotDto,
        entry: EntryDto,
        opts: { platformId?: number; onDone?: () => void } = {}
    ) {
        const replacing = slot.entry !== null && slot.entry.id !== entry.id;
        if (
            replacing &&
            !(await confirm({
                title: `Replace ${slot.entry!.game.name}?`,
                message: `${slot.entry!.game.name} is in ${slot.name}. Starting ${entry.game.name} there will pause it, and you can pick it back up later.`,
                confirmLabel: 'Replace',
                tone: 'default'
            }))
        ) {
            return;
        }
        setError(undefined);
        assign.mutate(
            {
                slotId: slot.id,
                body: {
                    entryId: entry.id,
                    platformId: opts.platformId,
                    date: todayLocal(),
                    replace: replacing
                }
            },
            {
                onSuccess: opts.onDone,
                onError: (e) =>
                    setError(e instanceof ApiRequestError ? e.message : "Couldn't update the slot.")
            }
        );
    }

    return { assignTo, pending: assign.isPending, error, clearError: () => setError(undefined) };
}
