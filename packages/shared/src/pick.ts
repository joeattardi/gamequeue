import { z } from 'zod';
import type { EntryDto, EntryStatus } from './collection.js';

export const pickFiltersSchema = z.object({
    /** Owned on any of these platforms */
    platformIds: z.array(z.number().int().positive()).optional(),
    /** Has any of these tags (case-insensitive) */
    tags: z.array(z.string().trim().min(1)).optional(),
    /** Has any of these genres (case-insensitive names) */
    genres: z.array(z.string().trim().min(1)).optional(),
    /** Games with an unknown time to beat are excluded when this is set */
    maxTtbMinutes: z.number().int().positive().optional(),
    includePaused: z.boolean().optional()
});
export type PickFilters = z.infer<typeof pickFiltersSchema>;

export const pickSchema = z.object({
    source: z.discriminatedUnion('type', [
        z.object({ type: z.literal('backlog') }),
        z.object({ type: z.literal('list'), listId: z.number().int().positive() }),
        z.object({ type: z.literal('smart'), smartListId: z.number().int().positive() })
    ]),
    filters: pickFiltersSchema.default({}),
    /** Entries already shown, oldest first; the last one is the most recent pick */
    excludeEntryIds: z.array(z.number().int().positive()).default([])
});
export type PickInput = z.infer<typeof pickSchema>;

export interface PickResultDto {
    entry: EntryDto | null;
    /** How many games matched the filters */
    candidateCount: number;
    /** True when every match had been shown, so the pool started over */
    wrapped: boolean;
}

/** The slice of an entry that picking cares about. */
export interface PickCandidate {
    id: number;
    status: EntryStatus;
    platformIds: number[];
    tags: string[];
    genres: string[];
    ttbMinutes: number | null;
}

export const toCandidate = (e: EntryDto): PickCandidate => ({
    id: e.id,
    status: e.status,
    platformIds: e.platforms.map((p) => p.id),
    tags: e.tags,
    genres: e.game.genres,
    ttbMinutes: e.ttbMinutes
});

const lower = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));

/** Games that can be picked: unplayed (plus paused if asked) and matching every filter set. */
export function filterCandidates(all: PickCandidate[], f: PickFilters = {}): PickCandidate[] {
    const tags = f.tags?.length ? lower(f.tags) : undefined;
    const genres = f.genres?.length ? lower(f.genres) : undefined;
    const platforms = f.platformIds?.length ? new Set(f.platformIds) : undefined;
    return all.filter((c) => {
        if (c.status !== 'unplayed' && !(f.includePaused && c.status === 'paused')) return false;
        if (platforms && !c.platformIds.some((p) => platforms.has(p))) return false;
        if (tags && !c.tags.some((t) => tags.has(t.toLowerCase()))) return false;
        if (genres && !c.genres.some((g) => genres.has(g.toLowerCase()))) return false;
        if (
            f.maxTtbMinutes !== undefined &&
            (c.ttbMinutes === null || c.ttbMinutes > f.maxTtbMinutes)
        ) {
            return false;
        }
        return true;
    });
}

export interface PickOptions {
    /** Returns a number in [0, 1); inject a seeded one in tests */
    rng?: () => number;
    /** Already shown, oldest first */
    excludeIds?: number[];
}

export interface PickOutcome {
    id: number | null;
    candidateCount: number;
    wrapped: boolean;
}

/**
 * Picks uniformly at random from the candidates that haven't been shown yet. Once all of them
 * have, the pool starts over (wrapped), but never repeats the most recent pick unless it's the
 * only candidate.
 */
export function pickRandom(candidates: PickCandidate[], opts: PickOptions = {}): PickOutcome {
    const rng = opts.rng ?? Math.random;
    const excluded = opts.excludeIds ?? [];
    if (candidates.length === 0) return { id: null, candidateCount: 0, wrapped: false };

    const seen = new Set(excluded);
    let pool = candidates.filter((c) => !seen.has(c.id));
    let wrapped = false;
    if (pool.length === 0) {
        wrapped = true;
        const last = excluded.at(-1);
        pool = candidates.length > 1 ? candidates.filter((c) => c.id !== last) : candidates;
    }
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    return { id: pool[index]!.id, candidateCount: candidates.length, wrapped };
}

/** Small seeded PRNG (mulberry32) for deterministic tests. */
export function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
