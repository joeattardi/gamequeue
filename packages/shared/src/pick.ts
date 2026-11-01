import { z } from 'zod';
import { ENTRY_STATUSES, type EntryDto, type EntryStatus } from './collection.js';

const pickFiltersSchema = z.object({
    /** Owned on any of these platforms */
    platformIds: z.array(z.number().int().positive()).optional(),
    /** Has any of these tags (case-insensitive) */
    tags: z.array(z.string().trim().min(1)).optional(),
    /** Has any of these genres (case-insensitive names) */
    genres: z.array(z.string().trim().min(1)).optional(),
    /** Games with an unknown time to beat are excluded when this is set */
    maxTtbMinutes: z.number().int().positive().optional(),
    /** Only games with one of these statuses; left out or empty means any status */
    statuses: z.array(z.enum(ENTRY_STATUSES)).optional()
});
type PickFilters = z.infer<typeof pickFiltersSchema>;

/** Most games one pick can draw ("pick of three") */
export const PICK_MAX_COUNT = 3;

export const pickSchema = z.object({
    source: z.discriminatedUnion('type', [
        z.object({ type: z.literal('collection') }),
        z.object({ type: z.literal('backlog') }),
        z.object({ type: z.literal('list'), listId: z.number().int().positive() }),
        z.object({ type: z.literal('smart'), smartListId: z.number().int().positive() })
    ]),
    filters: pickFiltersSchema.default({}),
    /** Entries already shown, oldest first; the last one is the most recent pick */
    excludeEntryIds: z.array(z.number().int().positive()).default([]),
    /** How many distinct games to draw: 1 for a plain pick, up to 3 to choose between */
    count: z.number().int().min(1).max(PICK_MAX_COUNT).default(1)
});
/** What a client sends (defaults may be left out) */
export type PickInput = z.input<typeof pickSchema>;
/** A validated pick request, defaults filled in */
export type PickRequest = z.output<typeof pickSchema>;

export interface PickResultDto {
    /** The first of `entries`, or null when nothing matched */
    entry: EntryDto | null;
    /** The games drawn, distinct, at most `count` (fewer when fewer match) */
    entries: EntryDto[];
    /** How many games matched the filters */
    candidateCount: number;
    /** True when every match had been shown, so the pool started over */
    wrapped: boolean;
    /** Games on the chosen list that aren't in the collection, so they could not be picked */
    skippedUnowned: number;
    /** Owned games in the chosen source by status, before any filter (explains an empty result) */
    poolStatuses: Partial<Record<EntryStatus, number>>;
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

/** Games that can be picked: any status unless `statuses` is set, and matching every filter set. */
export function filterCandidates(all: PickCandidate[], f: PickFilters = {}): PickCandidate[] {
    const tags = f.tags?.length ? lower(f.tags) : undefined;
    const genres = f.genres?.length ? lower(f.genres) : undefined;
    const statuses = f.statuses?.length ? new Set<EntryStatus>(f.statuses) : undefined;
    const platforms = f.platformIds?.length ? new Set(f.platformIds) : undefined;
    return all.filter((c) => {
        if (statuses && !statuses.has(c.status)) return false;
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

interface PickOptions {
    /** Returns a number in [0, 1); inject a seeded one in tests */
    rng?: () => number;
    /** Already shown, oldest first */
    excludeIds?: number[];
}

interface PickOutcome {
    id: number | null;
    candidateCount: number;
    wrapped: boolean;
}

interface PickManyOutcome {
    ids: number[];
    candidateCount: number;
    wrapped: boolean;
}

/**
 * Picks uniformly at random from the candidates that haven't been shown yet. Once all of them
 * have, the pool starts over (wrapped), but never repeats the most recent pick unless it's the
 * only candidate.
 */
export function pickRandom(candidates: { id: number }[], opts: PickOptions = {}): PickOutcome {
    const { ids, candidateCount, wrapped } = pickMany(candidates, 1, opts);
    return { id: ids[0] ?? null, candidateCount, wrapped };
}

/**
 * Draws up to `count` distinct candidates at random. Games not shown yet come first; when there are
 * too few of them the rest are drawn from the ones already shown (wrapped), avoiding the most recent
 * pick while anything else is left. Fewer than `count` come back only when fewer candidates exist.
 */
export function pickMany(
    candidates: { id: number }[],
    count: number,
    opts: PickOptions = {}
): PickManyOutcome {
    const rng = opts.rng ?? Math.random;
    const excluded = opts.excludeIds ?? [];
    if (candidates.length === 0) return { ids: [], candidateCount: 0, wrapped: false };

    const seen = new Set(excluded);
    const fresh = candidates.filter((c) => !seen.has(c.id)).map((c) => c.id);
    const ids = draw(fresh, Math.min(count, fresh.length), rng);
    let wrapped = false;
    if (ids.length < count) {
        wrapped = true;
        const last = excluded.at(-1);
        const shown = candidates.map((c) => c.id).filter((id) => seen.has(id));
        // The most recent pick goes last, so it is only drawn when nothing else is left
        const others = shown.filter((id) => id !== last);
        ids.push(...draw(others, Math.min(count - ids.length, others.length), rng));
        if (ids.length < count && last !== undefined && shown.includes(last)) ids.push(last);
    }
    return { ids, candidateCount: candidates.length, wrapped };
}

/** `n` distinct items in random order (a partial Fisher-Yates shuffle on a copy). */
function draw(items: number[], n: number, rng: () => number): number[] {
    const a = [...items];
    for (let i = 0; i < n; i++) {
        const j = i + Math.min(a.length - i - 1, Math.floor(rng() * (a.length - i)));
        [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a.slice(0, n);
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
