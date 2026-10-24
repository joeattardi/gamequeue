import { describe, expect, it } from 'vitest';
import { columnsFor, rowLayout } from './HighlightRow';

describe('columnsFor', () => {
    it('shows between 3 and 5 games plus the more tile', () => {
        expect(columnsFor(200)).toBe(4);
        expect(columnsFor(358)).toBe(4);
        expect(columnsFor(500)).toBe(4);
        expect(columnsFor(580)).toBe(5);
        expect(columnsFor(704)).toBe(6);
        expect(columnsFor(2000)).toBe(6);
    });
});

describe('rowLayout', () => {
    it('shows everything when it all fits, with no more tile', () => {
        expect(rowLayout(3, 3, 6)).toEqual({ shown: 3, more: 0 });
        expect(rowLayout(6, 6, 6)).toEqual({ shown: 6, more: 0 });
    });
    it('leaves a slot for the more tile and counts what is left out', () => {
        expect(rowLayout(12, 40, 6)).toEqual({ shown: 5, more: 35 });
        expect(rowLayout(7, 7, 6)).toEqual({ shown: 5, more: 2 });
        expect(rowLayout(12, 40, 4)).toEqual({ shown: 3, more: 37 });
    });
    it('counts games the profile did not send', () => {
        // two finishes with a known date, ten more without
        expect(rowLayout(2, 12, 6)).toEqual({ shown: 2, more: 10 });
    });
});
