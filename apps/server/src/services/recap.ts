import { eq } from 'drizzle-orm';
import { computeRecap, entryQuerySchema, isRecapYear, type RecapDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { playthroughs } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { listEntries } from './entries.js';

/** The `?year=` of a recap request: absent means "pick one for me", anything else must be a year. */
export function parseRecapYear(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    if (!isRecapYear(raw)) throw new HttpError(400, 'Invalid year');
    return Number(raw);
}

/** The year in review; without a `year` it picks this year, or the latest one with activity. */
export function getRecap(db: Db, userId: number, year?: number, now = new Date()): RecapDto {
    const history = db
        .select({
            entryId: playthroughs.entryId,
            platformId: playthroughs.platformId,
            startedOn: playthroughs.startedOn,
            endedOn: playthroughs.endedOn,
            outcome: playthroughs.outcome
        })
        .from(playthroughs)
        .where(eq(playthroughs.userId, userId))
        .all();
    return computeRecap(listEntries(db, userId, entryQuerySchema.parse({})), history, year, now);
}
