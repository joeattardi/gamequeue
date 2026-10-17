import type { PlaythroughDto } from '@gamequeue/shared';
import type { platforms, playthroughs } from '../db/schema.js';

export function toDto(
    p: typeof playthroughs.$inferSelect,
    platform: typeof platforms.$inferSelect | null
): PlaythroughDto {
    return {
        id: p.id,
        entryId: p.entryId,
        platform: platform
            ? { id: platform.id, name: platform.name, abbreviation: platform.abbreviation }
            : null,
        startedOn: p.startedOn,
        endedOn: p.endedOn,
        outcome: p.outcome,
        rating: p.rating
    };
}
