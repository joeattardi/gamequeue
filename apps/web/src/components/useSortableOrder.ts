import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useEffect, useState } from 'react';

/**
 * Drag-to-reorder state for a list of games (the queue on Home and on its page, any list): an
 * optimistic order that follows `items`, the dnd-kit sensors (pointer with a small threshold, and
 * the keyboard), and `commit(from, to)`, which moves one game by absolute position. Only the first
 * pages may be loaded, so an index here is also the game's index in the whole list.
 */
export function useSortableOrder<T extends { igdbId: number }>(
    items: T[],
    save: (igdbId: number, toIndex: number, onError: () => void) => void
) {
    const [order, setOrder] = useState(items);
    const [error, setError] = useState<string>();
    useEffect(() => setOrder(items), [items]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function commit(from: number, to: number) {
        if (to < 0 || to >= order.length) return;
        const igdbId = order[from]!.igdbId;
        setOrder(arrayMove(order, from, to)); // optimistic; the query refetches and corrects it if the save fails
        setError(undefined);
        save(igdbId, to, () => setError("Couldn't save the new order."));
    }

    function onDragEnd({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) return;
        commit(
            order.findIndex((e) => e.igdbId === active.id),
            order.findIndex((e) => e.igdbId === over.id)
        );
    }

    return { order, sensors, onDragEnd, commit, error };
}
