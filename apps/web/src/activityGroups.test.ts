import { describe, expect, it } from 'vitest';
import type { ActivityEventDto, ActivityType } from '@gamequeue/shared';
import { groupActivity, limitDays } from './activityGroups';

const now = new Date(2026, 9, 24, 15, 0).getTime();
let n = 0;
const ev = (type: ActivityType, at: number, game = true): ActivityEventDto => ({
    id: ++n,
    type,
    at,
    game: game ? { id: n, name: `G${n}`, coverImageId: null } : null,
    subject: game ? null : { id: n, name: `S${n}` },
    detail: null
});
const local = (d: number, h: number) => new Date(2026, 9, d, h).getTime();

describe('groupActivity', () => {
    it('labels local days and keeps newest first', () => {
        const days = groupActivity(
            [
                ev('started', local(24, 14)),
                ev('finished', local(23, 20)),
                ev('added', local(10, 9))
            ],
            now
        );
        expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Oct 10']);
    });

    it('folds a run of three or more of the same action into one burst', () => {
        const days = groupActivity(
            [ev('added', local(24, 14)), ev('added', local(24, 13)), ev('added', local(24, 12))],
            now
        );
        expect(days).toHaveLength(1);
        expect(days[0]!.items).toHaveLength(1);
        const item = days[0]!.items[0]!;
        expect(item).toMatchObject({ kind: 'burst', type: 'added', at: local(24, 14) });
        expect(item.kind === 'burst' && item.events).toHaveLength(3);
    });

    it('leaves a run of two alone, and does not fold across other actions or days', () => {
        const days = groupActivity(
            [
                ev('added', local(24, 14)),
                ev('added', local(24, 13)),
                ev('finished', local(24, 12)),
                ev('added', local(24, 11)),
                ev('added', local(23, 23)),
                ev('added', local(23, 22)),
                ev('added', local(23, 21))
            ],
            now
        );
        expect(days[0]!.items.map((i) => i.kind)).toEqual(['single', 'single', 'single', 'single']);
        expect(days[1]!.items.map((i) => i.kind)).toEqual(['burst']);
    });

    it('never folds grids, lists or slot moves', () => {
        const days = groupActivity(
            [
                ev('grid', local(24, 14), false),
                ev('grid', local(24, 13), false),
                ev('grid', local(24, 12), false)
            ],
            now
        );
        expect(days[0]!.items.map((i) => i.kind)).toEqual(['single', 'single', 'single']);
    });
});

describe('limitDays', () => {
    it('takes the first rows and counts the events behind them', () => {
        const events = [
            ev('added', local(24, 14)),
            ev('added', local(24, 13)),
            ev('added', local(24, 12)),
            ev('finished', local(24, 11)),
            ev('started', local(23, 10))
        ];
        const { days, events: used } = limitDays(groupActivity(events, now), 2);
        expect(days.flatMap((d) => d.items)).toHaveLength(2);
        expect(used).toBe(4);
    });
});
