import { describe, expect, it } from 'vitest';
import { gridFilename, wrapLines } from './gridImage';

// Every character is 10 wide
const measure = (t: string) => t.length * 10;

describe('wrapLines', () => {
    it('keeps short text on one line', () => {
        expect(wrapLines(measure, 'Best indie', 200, 2)).toEqual(['Best indie']);
    });
    it('wraps at spaces', () => {
        expect(wrapLines(measure, 'Best soundtrack on a handheld', 160, 3)).toEqual([
            'Best soundtrack',
            'on a handheld'
        ]);
        expect(wrapLines(measure, 'Game I recommend most', 130, 3)).toEqual([
            'Game I',
            'recommend',
            'most'
        ]);
    });
    it('ends the last line with an ellipsis when text is cut', () => {
        const lines = wrapLines(measure, 'one two three four five six', 80, 2);
        expect(lines).toHaveLength(2);
        expect(lines[1]!.endsWith('…')).toBe(true);
        expect(lines.every((l) => measure(l) <= 80)).toBe(true);
    });
    it('cuts a single word that is too wide', () => {
        const [line] = wrapLines(measure, 'Supercalifragilistic', 100, 1);
        expect(line!.endsWith('…')).toBe(true);
        expect(measure(line!)).toBeLessThanOrEqual(100);
    });
    it('returns nothing for empty text', () => {
        expect(wrapLines(measure, '   ', 100, 2)).toEqual([]);
    });
});

describe('gridFilename', () => {
    it('makes a safe jpg name', () => {
        expect(gridFilename('Best of 2026!')).toBe('best-of-2026.jpg');
        expect(gridFilename('  Café / Jeux  ')).toBe('cafe-jeux.jpg');
    });
    it('falls back when nothing is left', () => {
        expect(gridFilename('日本語')).toBe('grid.jpg');
    });
});
