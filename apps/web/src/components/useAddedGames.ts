import { useCallback, useRef, useState } from 'react';
import {
    useQuickAdd,
    useUndoQuickAdd,
    type QuickAddInput,
    type QuickAddResult
} from '../api/search';
import type { AddedState } from '../searchModel';
import { useToast } from './Toast';

const messageFor = (input: QuickAddInput) =>
    input.as === 'playing'
        ? `Started ${input.name}`
        : input.as === 'upnext'
          ? `${input.name} is up next`
          : input.as === 'wishlist'
            ? `${input.name} added to your wishlist`
            : `${input.name} added to your library`;

/**
 * Adds games from search results without leaving the page. Remembers what was added during this
 * search so its row can show the new status in place. Undo is offered in a toast (phone search) or,
 * with `toast: false`, by the caller on the row itself (the palette: a modal dialog makes the rest of
 * the page inert, so a toast behind it could not be clicked).
 */
export function useAddedGames({ toast: showToast = true }: { toast?: boolean } = {}) {
    const [added, setAdded] = useState<Map<number, AddedState>>(() => new Map());
    const records = useRef(new Map<number, { input: QuickAddInput; result: QuickAddResult }>());
    const quickAdd = useQuickAdd();
    const undoMutation = useUndoQuickAdd();
    const toast = useToast();

    const forget = useCallback((igdbId: number) => {
        records.current.delete(igdbId);
        setAdded((m) => {
            const next = new Map(m);
            next.delete(igdbId);
            return next;
        });
    }, []);

    const undo = useCallback(
        (igdbId: number) => {
            const record = records.current.get(igdbId);
            if (record) undoMutation.mutate(record, { onSuccess: () => forget(igdbId) });
        },
        [undoMutation, forget]
    );

    /** Rejects with the server's error so the caller (the sheet) can show it. */
    const add = useCallback(
        async (input: QuickAddInput): Promise<QuickAddResult> => {
            const result = await quickAdd.mutateAsync(input);
            records.current.set(input.igdbId, { input, result });
            setAdded((m) => new Map(m).set(input.igdbId, result));
            if (showToast)
                toast({
                    message: messageFor(input),
                    action: { label: 'Undo', onClick: () => undo(input.igdbId) }
                });
            return result;
        },
        [quickAdd, toast, showToast, undo]
    );

    return { added, add, undo, adding: quickAdd.isPending };
}
