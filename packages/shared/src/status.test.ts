import { describe, expect, it } from 'vitest';
import { ENTRY_STATUSES, type EntryStatus } from './collection.js';
import {
    availableActions,
    isValidIsoDate,
    nextStatus,
    statusFromHistory,
    STATUS_ACTIONS,
    type HistoryItem
} from './status.js';

describe('nextStatus', () => {
    const allowed: Record<string, EntryStatus | null>[] = [
        { 'unplayed/start': 'playing', 'finished/start': 'playing', 'abandoned/start': 'playing' },
        { 'playing/pause': 'paused', 'paused/resume': 'playing' },
        { 'playing/finish': 'finished', 'paused/finish': 'finished' },
        { 'playing/abandon': 'abandoned', 'paused/abandon': 'abandoned' }
    ];
    const table = Object.assign({}, ...allowed) as Record<string, EntryStatus>;

    it('allows exactly the documented transitions', () => {
        for (const status of ENTRY_STATUSES) {
            for (const action of STATUS_ACTIONS) {
                expect(nextStatus(status, action), `${status}/${action}`).toBe(
                    table[`${status}/${action}`] ?? null
                );
            }
        }
    });

    it('lists the actions available from each status', () => {
        expect(availableActions('unplayed')).toEqual(['start']);
        expect(availableActions('playing')).toEqual(['pause', 'finish', 'abandon']);
        expect(availableActions('paused')).toEqual(['resume', 'finish', 'abandon']);
        expect(availableActions('finished')).toEqual(['start']);
    });
});

describe('statusFromHistory', () => {
    const item = (
        id: number,
        outcome: HistoryItem['outcome'],
        startedOn: string | null,
        endedOn: string | null
    ): HistoryItem => ({ id, outcome, startedOn, endedOn });

    it('is unplayed with no history', () => {
        expect(statusFromHistory('finished', [])).toBe('unplayed');
    });

    it('keeps playing/paused while a playthrough is open', () => {
        const open = [
            item(1, 'finished', '2020-01-01', '2020-02-01'),
            item(2, null, '2024-01-01', null)
        ];
        expect(statusFromHistory('paused', open)).toBe('paused');
        expect(statusFromHistory('playing', open)).toBe('playing');
        expect(statusFromHistory('finished', open)).toBe('playing');
    });

    it('follows the most recently ended playthrough', () => {
        expect(
            statusFromHistory('unplayed', [
                item(1, 'finished', '2020-01-01', '2020-02-01'),
                item(2, 'abandoned', '2021-01-01', '2021-01-10')
            ])
        ).toBe('abandoned');
        expect(
            statusFromHistory('unplayed', [
                item(1, 'abandoned', '2023-01-01', '2023-01-10'),
                item(2, 'finished', '2019-01-01', '2019-03-01')
            ])
        ).toBe('abandoned');
    });

    it('treats unknown dates as oldest and breaks ties by id', () => {
        expect(
            statusFromHistory('unplayed', [
                item(1, 'abandoned', '2022-05-01', '2022-05-02'),
                item(2, 'finished', null, null)
            ])
        ).toBe('abandoned');
        expect(
            statusFromHistory('unplayed', [
                item(1, 'abandoned', null, null),
                item(2, 'finished', null, null)
            ])
        ).toBe('finished');
    });
});

describe('isValidIsoDate', () => {
    it('accepts real dates only', () => {
        expect(isValidIsoDate('2024-02-29')).toBe(true);
        expect(isValidIsoDate('2023-02-29')).toBe(false);
        expect(isValidIsoDate('2024-13-01')).toBe(false);
        expect(isValidIsoDate('2024-1-1')).toBe(false);
        expect(isValidIsoDate('yesterday')).toBe(false);
    });
});
