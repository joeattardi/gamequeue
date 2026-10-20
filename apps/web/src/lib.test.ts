import { describe, expect, it } from 'vitest';
import { greeting } from './lib';

describe('greeting', () => {
    const at = (h: number) => new Date(2026, 0, 1, h);
    it('follows the time of day', () => {
        expect(greeting('Joe', at(8))).toBe('Good morning, Joe');
        expect(greeting('Joe', at(14))).toBe('Good afternoon, Joe');
        expect(greeting('Joe', at(20))).toBe('Good evening, Joe');
        expect(greeting('Joe', at(2))).toBe('Hello, Joe');
    });
    it('works without a name', () => {
        expect(greeting(undefined, at(8))).toBe('Good morning');
        expect(greeting(null, at(8))).toBe('Good morning');
    });
});
