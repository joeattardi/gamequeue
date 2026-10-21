import { describe, expect, it } from 'vitest';
import { isReleased, releaseCountdown, releaseLabel, releasePeriodEnd } from './release.js';

describe('releaseLabel', () => {
    it('shows only what is known', () => {
        expect(releaseLabel('2026-11-19', 'day')).toBe('Nov 19, 2026');
        expect(releaseLabel('2026-11-19', null)).toBe('Nov 19, 2026');
        expect(releaseLabel('2026-11-30', 'month')).toBe('Nov 2026');
        expect(releaseLabel('2027-12-31', 'quarter')).toBe('Q4 2027');
        expect(releaseLabel('2027-01-01', 'quarter')).toBe('Q1 2027');
        expect(releaseLabel('2028-12-31', 'year')).toBe('2028');
        expect(releaseLabel(null, null)).toBe('TBA');
    });
});

describe('releasePeriodEnd / isReleased', () => {
    it('ends a vague date at the end of its period, wherever IGDB put the placeholder', () => {
        expect(releasePeriodEnd('2027-10-01', 'quarter')).toBe('2027-12-31');
        expect(releasePeriodEnd('2027-12-31', 'quarter')).toBe('2027-12-31');
        expect(releasePeriodEnd('2028-02-01', 'month')).toBe('2028-02-29');
    });

    it('treats a year as unreleased until it is over', () => {
        expect(isReleased('2026-12-31', 'year', '2026-10-20')).toBe(false);
        expect(isReleased('2026-12-31', 'year', '2026-12-31')).toBe(true);
        expect(isReleased('2026-10-20', 'day', '2026-10-20')).toBe(true);
        expect(isReleased('2026-10-21', null, '2026-10-20')).toBe(false);
        expect(isReleased(null, null, '2026-10-20')).toBe(false);
    });
});

describe('releaseCountdown', () => {
    it('counts days only for exact future dates', () => {
        expect(releaseCountdown('2026-11-19', 'day', '2026-10-20')).toBe('In 30 days');
        expect(releaseCountdown('2026-10-21', 'day', '2026-10-20')).toBe('Tomorrow');
        expect(releaseCountdown('2026-10-20', null, '2026-10-20')).toBe('Today');
        expect(releaseCountdown('2026-10-19', 'day', '2026-10-20')).toBeNull();
        expect(releaseCountdown('2027-12-31', 'quarter', '2026-10-20')).toBeNull();
        expect(releaseCountdown(null, null, '2026-10-20')).toBeNull();
    });
});
