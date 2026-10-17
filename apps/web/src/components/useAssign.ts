import type { EntryDto, SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { ApiRequestError } from '../api/client';
import { useAssignSlot } from '../api/slots';
import { todayLocal } from '../lib';

/**
 * Puts a game in a slot, asking first if that would replace another game
 * (the replaced one is paused, never lost).
 */
export function useAssign() {
    const assign = useAssignSlot();
    const [error, setError] = useState<string>();

    function assignTo(
        slot: SlotDto,
        entry: EntryDto,
        opts: { platformId?: number; onDone?: () => void } = {}
    ) {
        const replacing = slot.entry !== null && slot.entry.id !== entry.id;
        if (
            replacing &&
            !confirm(
                `${slot.entry!.game.name} is in ${slot.name}.\n\n` +
                    `Replace it with ${entry.game.name}? ${slot.entry!.game.name} will be paused ` +
                    `and you can pick it back up later.`
            )
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
