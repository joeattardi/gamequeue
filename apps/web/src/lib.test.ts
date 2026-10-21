import { describe, expect, it } from 'vitest';
import { greeting, timeAgo } from './lib';

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

describe('timeAgo', () => {
    const now = 1_000_000_000_000;
    it('rounds down to the largest unit', () => {
        expect(timeAgo(now - 5_000, now)).toBe('just now');
        expect(timeAgo(now - 60_000, now)).toBe('1 minute ago');
        expect(timeAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
        expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 hours ago');
        expect(timeAgo(now - 49 * 3600_000, now)).toBe('2 days ago');
    });
    it('treats a time in the future as just now', () => {
        expect(timeAgo(now + 60_000, now)).toBe('just now');
    });
});
