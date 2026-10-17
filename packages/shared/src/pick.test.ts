import { describe, expect, it } from 'vitest';
import { filterCandidates, pickRandom, seededRng, type PickCandidate } from './pick.js';

const c = (id: number, extra: Partial<PickCandidate> = {}): PickCandidate => ({
    id,
    status: 'unplayed',
    platformIds: [1],
    tags: [],
    genres: [],
    ttbMinutes: 600,
    ...extra
});

describe('filterCandidates', () => {
    it('only offers unplayed games, plus paused when asked', () => {
        const all = [
            c(1),
            c(2, { status: 'paused' }),
            c(3, { status: 'playing' }),
            c(4, { status: 'finished' }),
            c(5, { status: 'abandoned' })
        ];
        expect(filterCandidates(all).map((x) => x.id)).toEqual([1]);
        expect(filterCandidates(all, { includePaused: true }).map((x) => x.id)).toEqual([1, 2]);
    });

    it('matches any selected platform, tag or genre (case-insensitively)', () => {
        const all = [
            c(1, { platformIds: [1], tags: ['Cozy'], genres: ['Puzzle'] }),
            c(2, { platformIds: [2, 3], tags: ['hard'], genres: ['RPG'] }),
            c(3, { platformIds: [3], tags: [], genres: [] })
        ];
        expect(filterCandidates(all, { platformIds: [3] }).map((x) => x.id)).toEqual([2, 3]);
        expect(filterCandidates(all, { platformIds: [1, 2] }).map((x) => x.id)).toEqual([1, 2]);
        expect(filterCandidates(all, { tags: ['COZY', 'hard'] }).map((x) => x.id)).toEqual([1, 2]);
        expect(filterCandidates(all, { genres: ['rpg'] }).map((x) => x.id)).toEqual([2]);
    });

    it('combines different filters with AND', () => {
        const all = [
            c(1, { platformIds: [1], tags: ['cozy'] }),
            c(2, { platformIds: [2], tags: ['cozy'] }),
            c(3, { platformIds: [1], tags: ['hard'] })
        ];
        expect(
            filterCandidates(all, { platformIds: [1], tags: ['cozy'] }).map((x) => x.id)
        ).toEqual([1]);
    });

    it('caps time to beat and excludes unknown times when a cap is set', () => {
        const all = [
            c(1, { ttbMinutes: 120 }),
            c(2, { ttbMinutes: 600 }),
            c(3, { ttbMinutes: null })
        ];
        expect(filterCandidates(all, { maxTtbMinutes: 600 }).map((x) => x.id)).toEqual([1, 2]);
        expect(filterCandidates(all, { maxTtbMinutes: 119 })).toEqual([]);
        expect(filterCandidates(all, {}).map((x) => x.id)).toEqual([1, 2, 3]);
    });

    it('treats empty filter arrays as no filter', () => {
        const all = [c(1), c(2)];
        expect(filterCandidates(all, { platformIds: [], tags: [], genres: [] })).toHaveLength(2);
    });
});

describe('pickRandom', () => {
    const pool = [c(10), c(20), c(30), c(40)];

    it('returns nothing for an empty pool', () => {
        expect(pickRandom([])).toEqual({ id: null, candidateCount: 0, wrapped: false });
    });

    it('uses the injected rng to choose deterministically', () => {
        expect(pickRandom(pool, { rng: () => 0 }).id).toBe(10);
        expect(pickRandom(pool, { rng: () => 0.26 }).id).toBe(20);
        expect(pickRandom(pool, { rng: () => 0.99 }).id).toBe(40);
        expect(pickRandom(pool, { rng: () => 1 }).id).toBe(40); // guards a rng that returns 1
        const a = seededRng(7);
        const b = seededRng(7);
        expect([1, 2, 3].map(() => pickRandom(pool, { rng: a }).id)).toEqual(
            [1, 2, 3].map(() => pickRandom(pool, { rng: b }).id)
        );
    });

    it('skips games that were already shown', () => {
        const out = pickRandom(pool, { rng: () => 0, excludeIds: [10, 20] });
        expect(out).toEqual({ id: 30, candidateCount: 4, wrapped: false });
    });

    it('wraps once everything has been shown, without repeating the last pick', () => {
        const ids = [10, 20, 30, 40];
        for (let seed = 0; seed < 50; seed++) {
            const out = pickRandom(pool, { rng: seededRng(seed), excludeIds: ids });
            expect(out.wrapped).toBe(true);
            expect(out.id).not.toBe(40);
        }
    });

    it('repeats the only candidate rather than returning nothing', () => {
        const out = pickRandom([c(1)], { excludeIds: [1] });
        expect(out).toEqual({ id: 1, candidateCount: 1, wrapped: true });
    });

    it('is roughly uniform', () => {
        const rng = seededRng(42);
        const counts = new Map<number, number>();
        for (let i = 0; i < 4000; i++) {
            const id = pickRandom(pool, { rng }).id!;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        for (const id of [10, 20, 30, 40]) expect(counts.get(id)!).toBeGreaterThan(850);
    });

    it('defaults to Math.random', () => {
        const out = pickRandom(pool);
        expect([10, 20, 30, 40]).toContain(out.id);
    });
});
