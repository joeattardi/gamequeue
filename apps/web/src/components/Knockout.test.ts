import { describe, expect, it } from 'vitest';
import { knockoutDelays } from './Knockout';

describe('knockoutDelays', () => {
    it('has one delay per elimination and none for nothing', () => {
        expect(knockoutDelays(0, false)).toEqual([]);
        expect(knockoutDelays(4, false)).toHaveLength(4);
    });

    it('slows down towards the end', () => {
        const d = knockoutDelays(6, false);
        expect(d.at(-1)!).toBeGreaterThan(d[0]!);
    });

    it('keeps the run about as long for a big pool as a small one', () => {
        const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(total(knockoutDelays(3, false))).toBeCloseTo(7000, -1);
        expect(total(knockoutDelays(12, false))).toBeCloseTo(7000, -1);
    });

    it('is much shorter with reduced motion', () => {
        const total = knockoutDelays(8, true).reduce((a, b) => a + b, 0);
        expect(total).toBeLessThan(1000);
    });
});
