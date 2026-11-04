import { availableActions, nextStatus } from '@gamequeue/shared';
import { describe, expect, it } from 'vitest';
import { STATUS_ORDER, actionOf, moveTo, primaryAction } from './statusMoves';

describe('moveTo', () => {
    it('every move the control offers is an action the server allows, and lands on the chosen status', () => {
        for (const from of STATUS_ORDER)
            for (const to of STATUS_ORDER) {
                const move = moveTo(from, to);
                if (!move) continue;
                const action = actionOf(move);
                if (action === null) continue; // logAbandoned: a past playthrough, not an action
                expect(availableActions(from)).toContain(action);
                const landed = nextStatus(from, action);
                // Starting paused lands on paused through the start body, not another action
                const expected = move.kind === 'start' && move.paused ? 'playing' : to;
                expect(landed).toBe(expected);
            }
    });
    it('never offers staying where you are', () => {
        for (const s of STATUS_ORDER) expect(moveTo(s, s)).toBeNull();
    });
    it('lets a game you have not played go straight to playing, paused or abandoned', () => {
        expect(moveTo('unplayed', 'playing')).toEqual({ kind: 'start', paused: false });
        expect(moveTo('unplayed', 'paused')).toEqual({ kind: 'start', paused: true });
        expect(moveTo('unplayed', 'abandoned')).toEqual({ kind: 'logAbandoned' });
        expect(moveTo('unplayed', 'finished')).toBeNull();
    });
    it('lets a finished or abandoned game be played again, and nothing else', () => {
        for (const from of ['finished', 'abandoned'] as const)
            for (const to of STATUS_ORDER) expect(moveTo(from, to) !== null).toBe(to === 'playing');
    });
});

describe('primaryAction', () => {
    it('is the most likely next step for each status', () => {
        expect(primaryAction('unplayed').label).toBe('Start playing');
        expect(primaryAction('paused').label).toBe('Resume');
        expect(primaryAction('playing').label).toBe('Mark finished');
        expect(primaryAction('finished').label).toBe('Play again');
        expect(primaryAction('abandoned').label).toBe('Play again');
    });
    it('is a move the status allows', () => {
        for (const s of STATUS_ORDER) {
            const action = actionOf(primaryAction(s).move);
            expect(availableActions(s)).toContain(action);
        }
    });
});
