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
        pool = listEntries(db, userId, { view: 'backlog', sort: 'title' });
        if (input.filters.includePaused) {
            pool = pool.concat(
                listEntries(db, userId, { view: 'all', status: ['paused'], sort: 'title' })
            );
        }
    }
    const candidates = filterCandidates(pool.map(toCandidate), input.filters);
    const outcome = pickRandom(candidates, { rng, excludeIds: input.excludeEntryIds });
    return {
        entry: pool.find((e) => e.id === outcome.id) ?? null,
        candidateCount: outcome.candidateCount,
        wrapped: outcome.wrapped,
        skippedUnowned
    };
}
