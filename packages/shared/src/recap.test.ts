import { describe, expect, it } from 'vitest';
import type { EntryDto } from './collection.js';
import { computeRecap, defaultRecapYear, type RecapPlaythrough } from './recap.js';

let nextId = 1;
const entry = (over: Record<string, unknown> = {}, game: Record<string, unknown> = {}) =>
    ({
        id: nextId++,
        status: 'finished',
        rating: null,
        ttbMinutes: null,
        notes: 'private',
        addedAt: Date.parse('2020-01-01T00:00:00Z'),
        platforms: [],
        tags: [],
        lastFinishedOn: null,
        ...over,
        game: { name: 'G', genres: [], platforms: [], ...game }
    }) as unknown as EntryDto;

const fin = (entryId: number, endedOn: string | null, startedOn: string | null = null) =>
    ({ entryId, platformId: null, startedOn, endedOn, outcome: 'finished' }) as RecapPlaythrough;

const NOW = new Date('2026-10-19T12:00:00Z');

describe('computeRecap', () => {
    it('is empty for an empty collection', () => {
        const r = computeRecap([], [], undefined, NOW);
        expect(r).toMatchObject({ year: 2026, years: [], finishedGames: 0, busiestMonth: null });
        expect(r.months).toEqual(Array(12).fill(0));
        expect(r.archetype).toBeNull();
        expect(r.games).toEqual([]);
    });

    it('counts a game once per year and skips unknown dates', () => {
        const a = entry({ ttbMinutes: 60 }, { name: 'A' });
        const b = entry({ ttbMinutes: 600 }, { name: 'B' });
        const c = entry({}, { name: 'C' });
        const r = computeRecap(
            [a, b, c],
            [
                fin(a.id, '2025-01-10'),
                fin(a.id, '2025-03-01'),
                fin(b.id, '2025-03-20'),
                fin(c.id, null)
            ],
            2025,
            NOW
        );
        expect(r.finishedGames).toBe(2);
        expect(r.estimatedMinutes).toBe(720);
        expect(r.months.slice(0, 3)).toEqual([1, 0, 2]);
        expect(r.busiestMonth).toBe(3);
        expect(r.longest?.entry.game.name).toBe('B');
        expect(r.shortest?.entry.game.name).toBe('A');
        expect(r.games.map((e) => e.game.name)).toEqual(['A', 'B']);
        expect(r.firstFinish?.on).toBe('2025-03-01');
        expect(r.lastFinish?.on).toBe('2025-03-20');
    });

    it('counts finishes of games finished in an earlier year as replays', () => {
        const a = entry({}, { name: 'A' });
        const r = computeRecap([a], [fin(a.id, '2023-05-05'), fin(a.id, '2025-05-05')], 2025, NOW);
        expect(r.replays).toBe(1);
        expect(r.previousFinishedGames).toBe(0);
        expect(computeRecap([a], [fin(a.id, '2023-05-05')], 2024, NOW).previousFinishedGames).toBe(
            1
        );
    });

    it('finds the longest haul only from known dates', () => {
        const a = entry({}, { name: 'A' });
        const b = entry({}, { name: 'B' });
        const r = computeRecap(
            [a, b],
            [fin(a.id, '2025-02-01', '2025-01-01'), fin(b.id, '2025-12-01')],
            2025,
            NOW
        );
        expect(r.longestHaul).toMatchObject({ days: 31, entry: { game: { name: 'A' } } });
    });

    it('ranks genres once per game and averages ratings', () => {
        const a = entry({ rating: 5 }, { name: 'A', genres: ['RPG', 'rpg', 'Indie'] });
        const b = entry({ rating: 4 }, { name: 'B', genres: ['RPG'] });
        const r = computeRecap(
            [a, b],
            [fin(a.id, '2025-01-01'), fin(b.id, '2025-01-02')],
            2025,
            NOW
        );
        expect(r.topGenres).toEqual([
            { name: 'RPG', count: 2 },
            { name: 'Indie', count: 1 }
        ]);
        expect(r.averageRating).toBe(4.5);
        expect(r.topRated.map((e) => e.game.name)).toEqual(['A', 'B']);
    });

    it('names the platform of the playthrough', () => {
        const pc = { id: 6, name: 'PC', abbreviation: 'PC' };
        const a = entry({ platforms: [pc] }, { name: 'A' });
        const r = computeRecap(
            [a],
            [{ ...fin(a.id, '2025-01-01'), platformId: 6 }, fin(a.id, '2025-02-01')],
            2025,
            NOW
        );
        expect(r.topPlatforms).toEqual([{ name: 'PC', count: 1 }]);
    });

    it('lists years with activity and defaults to this year, else the latest', () => {
        const a = entry({ addedAt: Date.parse('2022-06-01T00:00:00Z') });
        const r = computeRecap([a], [fin(a.id, '2024-01-01')], undefined, NOW);
        expect(r.years).toEqual([2024, 2022]);
        expect(r.year).toBe(2024);
        expect(defaultRecapYear([2026, 2024], NOW)).toBe(2026);
        expect(defaultRecapYear([], NOW)).toBe(2026);
    });

    it('labels the year', () => {
        const games = Array.from({ length: 5 }, (_, i) =>
            entry({ ttbMinutes: 120 }, { name: `G${i}` })
        );
        const done = games.map((g, i) => fin(g.id, `2025-0${i + 1}-01`));
        expect(computeRecap(games, done, 2025, NOW).archetype?.id).toBe('sprinter');
        const longGames = games.map((g) => ({ ...g, ttbMinutes: 3000 }));
        expect(computeRecap(longGames, done, 2025, NOW).archetype?.id).toBe('marathoner');
        const one = computeRecap(games.slice(0, 1), done.slice(0, 1), 2025, NOW);
        expect(one.archetype?.id).toBe('steady');
        const shelf = Array.from({ length: 12 }, () =>
            entry({ addedAt: Date.parse('2025-02-02T00:00:00Z') })
        );
        expect(
            computeRecap(shelf, [fin(shelf[0]!.id, '2025-03-03')], 2025, NOW).archetype?.id
        ).toBe('collector');
    });

    it('never includes notes', () => {
        const a = entry({ rating: 3 });
        expect(
            JSON.stringify(computeRecap([a], [fin(a.id, '2025-01-01')], 2025, NOW))
        ).not.toContain('private');
    });
});
