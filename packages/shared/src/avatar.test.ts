import { describe, expect, it } from 'vitest';
import { AVATAR_GRID, generateIdenticon } from './avatar.js';

describe('generateIdenticon', () => {
    it('is deterministic and ignores case and surrounding space', () => {
        expect(generateIdenticon('joe')).toEqual(generateIdenticon(' JOE '));
    });

    it('differs between usernames', () => {
        const seen = new Set(
            ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'].map((n) =>
                JSON.stringify(generateIdenticon(n))
            )
        );
        expect(seen.size).toBe(6);
    });

    it('is mirrored left to right, in range, and never blank', () => {
        for (const name of ['a', 'bb', 'user_1', 'x-y-z', 'zzzzzzzz']) {
            const { hue, cells } = generateIdenticon(name);
            expect(hue).toBeGreaterThanOrEqual(0);
            expect(hue).toBeLessThan(360);
            expect(cells).toHaveLength(AVATAR_GRID);
            for (const row of cells) expect(row).toEqual([...row].reverse());
            expect(cells.flat().some(Boolean)).toBe(true);
        }
    });
});
