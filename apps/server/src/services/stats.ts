import { and, eq } from 'drizzle-orm';
import { computeStats, entryQuerySchema, type StatsDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { playthroughs } from '../db/schema.js';
import { listEntries } from './entries.js';

export function getStats(db: Db, userId: number, now = new Date()): StatsDto {
    const finishes = db
        .select({ entryId: playthroughs.entryId, endedOn: playthroughs.endedOn })
        .from(playthroughs)
        .where(and(eq(playthroughs.userId, userId), eq(playthroughs.outcome, 'finished')))
        .all();
    return computeStats(listEntries(db, userId, entryQuerySchema.parse({})), finishes, now);
}
