import { describe, expect, it } from 'vitest';
import type { ActivityEventDto, TimelineDto } from '@gamequeue/shared';
import { buildCalendar, calendarRange, levelOf } from './calendar';

const ev = (id: number, type: ActivityEventDto['type'], day: string): ActivityEventDto => ({
    id,
    type,
    at: new Date(`${day}T10:00:00`).getTime(),
    game: null,
    subject: null,
    detail: null
});

describe('calendar', () => {
    it('covers 53 Sunday-first weeks ending today', () => {
        // 2026-10-24 is a Saturday
        expect(calendarRange('2026-10-24')).toEqual({ from: '2025-10-19', to: '2026-10-24' });
        const c = buildCalendar({ events: [], playing: [] }, '2026-10-24');
        expect(c.weeks).toHaveLength(53);
        expect(c.weeks.every((w) => w[0]!.weekday === 0)).toBe(true);
        expect(c.weeks.slice(0, -1).every((w) => w.length === 7)).toBe(true);
        expect(c.weeks.at(-1)!.at(-1)!.key).toBe('2026-10-24');
    });

    it('buckets events into local days and groups', () => {
        const timeline: TimelineDto = {
            events: [
                ev(1, 'finished', '2026-10-20'),
                ev(2, 'rated', '2026-10-20'),
                ev(3, 'started', '2026-10-20'),
                ev(4, 'added', '2026-10-21'),
                ev(5, 'added', '2024-01-01') // outside the window
            ],
            playing: []
        };
        const c = buildCalendar(timeline, '2026-10-24');
        const days = new Map(c.weeks.flat().map((d) => [d.key, d]));
        expect(c.total).toBe(4);
        expect(days.get('2026-10-20')!.groups).toEqual(['finished', 'played', 'collected']);
        expect(days.get('2026-10-21')!.groups).toEqual(['collected']);
        expect(days.get('2026-10-22')!.groups).toEqual([]);
    });

    it('spreads playthroughs over their days, clipped to the window', () => {
        const c = buildCalendar(
            {
                events: [],
                playing: [
                    { game: { id: 1, name: 'Hades' }, start: '2025-01-01', end: '2025-11-02' },
                    { game: { id: 2, name: 'Celeste' }, start: '2026-10-23', end: '2026-10-30' }
                ]
            },
            '2026-10-24'
        );
        const days = new Map(c.weeks.flat().map((d) => [d.key, d]));
        expect(days.get('2025-10-19')!.playing.map((g) => g.name)).toEqual(['Hades']);
        expect(days.get('2025-11-02')!.playing).toHaveLength(1);
        expect(days.get('2025-11-03')!.playing).toHaveLength(0);
        expect(days.get('2026-10-24')!.playing.map((g) => g.name)).toEqual(['Celeste']);
    });

    it('caps the intensity at four', () => {
        expect([1, 2, 3, 4, 9].map(levelOf)).toEqual([1, 2, 3, 4, 4]);
    });
});
