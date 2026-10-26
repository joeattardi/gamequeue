import { describe, expect, it } from 'vitest';
import { formatCount, parseCount } from './CountUp';

describe('parseCount', () => {
    it('reads plain, grouped, decimal and unit figures', () => {
        expect(parseCount('42')).toEqual({ n: 42, decimals: 0, grouped: false, unit: '' });
        expect(parseCount('1,234')).toEqual({ n: 1234, decimals: 0, grouped: true, unit: '' });
        expect(parseCount('4.2')).toEqual({ n: 4.2, decimals: 1, grouped: false, unit: '' });
        expect(parseCount('12.5 MB')).toEqual({
            n: 12.5,
            decimals: 1,
            grouped: false,
            unit: ' MB'
        });
        expect(parseCount('56h')).toEqual({ n: 56, decimals: 0, grouped: false, unit: 'h' });
    });

    it('leaves anything that is not one number alone', () => {
        for (const text of ['—', '3d 4h', 'Oct 2026', '', 'about 5', '1,23'])
            expect(parseCount(text)).toBeNull();
    });
});

describe('formatCount', () => {
    it('writes an in-between value like the original', () => {
        expect(formatCount(617.4, parseCount('1,234')!)).toBe('617');
        expect(formatCount(1617.4, parseCount('1,234')!)).toBe('1,617');
        expect(formatCount(2.13, parseCount('4.2')!)).toBe('2.1');
        expect(formatCount(6, parseCount('12.5 MB')!)).toBe('6.0 MB');
    });
});
