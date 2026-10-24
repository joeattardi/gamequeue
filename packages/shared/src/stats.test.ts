import { describe, expect, it } from 'vitest';
import type { EntryDto } from './collection.js';
import { computeStats } from './stats.js';

let nextId = 1;
const entry = (over: Record<string, unknown> = {}, game: Record<string, unknown> = {}) =>
    ({
        id: nextId++,
        status: 'unplayed',
        rating: null,
        ttbMinutes: null,
        notes: 'private',
        platforms: [],
        tags: [],
        lastFinishedOn: null,
        ...over,
        game: { name: 'G', genres: [], ...game }
    }) as unknown as EntryDto;

const NOW = new Date('2026-10-18T12:00:00Z');

describe('computeStats', () => {
    it('is all zeros for an empty collection', () => {
        const s = computeStats([], [], NOW);
        expect(s.overview).toMatchObject({ total: 0, averageRating: null, backlogMinutes: 0 });
        expect(s.finished.years).toEqual([]);
        expect(s.finished.months).toHaveLength(12);
        expect(s.finished.months.every((m) => m.count === 0)).toBe(true);
        expect(s.ratings.distribution.map((d) => d.count)).toEqual([0, 0, 0, 0, 0]);
        expect(s.ratings.top).toEqual([]);
    });

    it('summarises the backlog and ratings', () => {
        const a = entry({ ttbMinutes: 60, rating: 5 }, { name: 'A' });
        const b = entry({ ttbMinutes: 120 }, { name: 'B' });
        const c = entry({}, { name: 'C' });
        const d = entry({ status: 'finished', ttbMinutes: 600, rating: 4 }, { name: 'D' });
        const s = computeStats([a, b, c, d], [], NOW);
        expect(s.overview).toMatchObject({
            total: 4,
            backlogCount: 3,
            backlogMinutes: 180,
            backlogUnknown: 1,
            ratedCount: 2,
            averageRating: 4.5
        });
        expect(s.overview.byStatus).toMatchObject({ unplayed: 3, finished: 1, playing: 0 });
        expect(s.ratings.distribution.map((x) => x.count)).toEqual([0, 0, 0, 1, 1]);
        expect(s.ratings.top.map((e) => e.game.name)).toEqual(['A', 'D']);
        expect(JSON.stringify(s)).not.toContain('private');
    });

    it('counts a game once per year and month, keeps unknown dates apart, and skips them for months', () => {
        const a = entry({ status: 'finished' });
        const b = entry({ status: 'finished' });
        const s = computeStats(
            [a, b],
            [
                { entryId: a.id, endedOn: '2025-03-01', playtimeMinutes: null },
                { entryId: a.id, endedOn: '2025-03-20', playtimeMinutes: null },
                { entryId: a.id, endedOn: '2026-10-02', playtimeMinutes: null },
                { entryId: b.id, endedOn: '2026-10-05', playtimeMinutes: null },
                { entryId: b.id, endedOn: null, playtimeMinutes: null }
            ],
            NOW
        );
        expect(s.finished.years).toEqual([
            { year: '2025', count: 1 },
            { year: '2026', count: 2 },
            { year: 'unknown', count: 1 }
        ]);
        expect(s.finished.months[0]).toEqual({ month: '2025-11', count: 0 });
        expect(s.finished.months[11]).toEqual({ month: '2026-10', count: 2 });
        // 2025-03 is outside the last 12 months
        expect(s.finished.months.reduce((n, m) => n + m.count, 0)).toBe(2);
    });

    it('adds up the entered play time over finished playthroughs, replays included', () => {
        const a = entry({ status: 'finished' });
        const b = entry({ status: 'finished' });
        const s = computeStats(
            [a, b],
            [
                { entryId: a.id, endedOn: '2024-01-01', playtimeMinutes: 100 },
                { entryId: a.id, endedOn: '2025-01-01', playtimeMinutes: 90 },
                { entryId: b.id, endedOn: null, playtimeMinutes: null },
                { entryId: 999, endedOn: null, playtimeMinutes: 500 }
            ],
            NOW
        );
        expect(s.playtime).toEqual({ playMinutes: 190, finishes: 3, unrecordedCount: 1 });
    });

    it('breaks the collection down by platform, genre and tag, biggest first', () => {
        const pc = { id: 6, name: 'PC' };
        const sw = { id: 130, name: 'Switch' };
        const es = [
            entry(
                { status: 'finished', platforms: [pc, sw], tags: ['Cozy', 'cozy'] },
                { genres: ['RPG', 'rpg'] }
            ),
            entry({ platforms: [pc], tags: ['cozy'] }, { genres: ['Puzzle'] }),
            entry({ status: 'playing', platforms: [sw] }, { genres: ['RPG'] })
        ];
        const s = computeStats(es, [], NOW).breakdowns;
        expect(s.platforms).toEqual([
            { name: 'PC', total: 2, finished: 1, unplayed: 1 },
            { name: 'Switch', total: 2, finished: 1, unplayed: 0 }
        ]);
        expect(s.genres.map((g) => [g.name, g.total])).toEqual([
            ['RPG', 2],
            ['Puzzle', 1]
        ]);
        expect(s.tags).toEqual([{ name: 'Cozy', total: 2, finished: 1, unplayed: 1 }]);
    });

    it('limits each breakdown to the top 10', () => {
        const es = Array.from({ length: 15 }, (_, i) => entry({ tags: [`t${i}`] }));
        expect(computeStats(es, [], NOW).breakdowns.tags).toHaveLength(10);
    });
});
