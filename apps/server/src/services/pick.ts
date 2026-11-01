import {
    filterCandidates,
    ownedEntries,
    pickRandom,
    toCandidate,
    type EntryDto,
    type PickInput,
    type PickResultDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { listEntries } from './entries.js';
import { getList } from './lists.js';
import { getSmartList } from './smart-lists.js';

/** Random pick from the backlog or a list. `rng` is injectable for tests. */
export function pick(
    db: Db,
    userId: number,
    input: PickInput,
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
    const outcome = pickRandom(candidates, { rng, excludeIds: input.excludeEntryIds });
    return {
        entry: pool.find((e) => e.id === outcome.id) ?? null,
        candidateCount: outcome.candidateCount,
        wrapped: outcome.wrapped,
        skippedUnowned,
        poolStatuses
    };
}
