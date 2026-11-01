import {
    filterCandidates,
    ownedEntries,
    pickMany,
    toCandidate,
    type EntryDto,
    type PickRequest,
    type PickResultDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { listEntries } from './entries.js';
import { getList } from './lists.js';
import { getSmartList } from './smart-lists.js';

/** Random pick (one game, or up to three to choose between) from a source. `rng` is injectable for tests. */
export function pick(
    db: Db,
    userId: number,
    input: PickRequest,
    rng: () => number = Math.random
): PickResultDto {
    let pool: EntryDto[];
    let skippedUnowned = 0;
    if (input.source.type === 'list') {
        // A list can hold games that aren't in the collection; only owned ones can be picked
        const { items } = getList(db, userId, input.source.listId);
        pool = ownedEntries(items);
        skippedUnowned = items.length - pool.length;
    } else if (input.source.type === 'smart') {
        pool = getSmartList(db, userId, input.source.smartListId).entries;
    } else {
        // 'backlog' is the derived Not Started view; 'collection' is every owned game
        pool = listEntries(db, userId, {
            view: input.source.type === 'backlog' ? 'backlog' : 'all',
            sort: 'title'
        });
    }
    const poolStatuses: PickResultDto['poolStatuses'] = {};
    for (const e of pool) poolStatuses[e.status] = (poolStatuses[e.status] ?? 0) + 1;
    const candidates = filterCandidates(pool.map(toCandidate), input.filters);
    const outcome = pickMany(candidates, input.count, { rng, excludeIds: input.excludeEntryIds });
    const byId = new Map(pool.map((e) => [e.id, e]));
    const entries = outcome.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return {
        entry: entries[0] ?? null,
        entries,
        candidateCount: outcome.candidateCount,
        wrapped: outcome.wrapped,
        skippedUnowned,
        poolStatuses
    };
}
