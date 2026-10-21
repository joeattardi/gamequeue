/**
 * Moves `id` to index `toIndex` (clamped) in an ordered list of ids. Returns the new order and the
 * range of indexes whose position changed, so callers only rewrite those rows; undefined when `id`
 * isn't in the list.
 */
export function moveInOrder<T>(ids: T[], id: T, toIndex: number) {
    const from = ids.indexOf(id);
    if (from === -1) return undefined;
    const to = Math.min(Math.max(toIndex, 0), ids.length - 1);
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    return { next, first: Math.min(from, to), last: Math.max(from, to) };
}
