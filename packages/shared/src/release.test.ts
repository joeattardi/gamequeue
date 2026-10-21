import { describe, expect, it } from 'vitest';
import {
    isReleased,
    relativeDays,
    releaseBadge,
    releaseLabel,
    releasePeriodEnd
} from './release.js';

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

describe('relativeDays', () => {
    it('uses the unit that reads best', () => {
        expect(relativeDays(0)).toBe('today');
        expect(relativeDays(1)).toBe('tomorrow');
        expect(relativeDays(6)).toBe('in 6 days');
        expect(relativeDays(13)).toBe('in 13 days');
        expect(relativeDays(14)).toBe('in 2 weeks');
        expect(relativeDays(55)).toBe('in 8 weeks');
        expect(relativeDays(56)).toBe('in 2 months');
        expect(relativeDays(95)).toBe('in 3 months');
        expect(relativeDays(330)).toBe('in 11 months');
        expect(relativeDays(365)).toBe('in 1 year');
        expect(relativeDays(900)).toBe('in 2 years');
    });
});

describe('releaseBadge', () => {
    const today = '2026-10-20';
    it('counts down to an exact date', () => {
        expect(releaseBadge('2026-10-26', 'day', today)).toBe('in 6 days');
        expect(releaseBadge('2027-01-20', null, today)).toBe('in 3 months');
        expect(releaseBadge('2026-10-20', 'day', today)).toBeNull();
    });
    it('shows a vague date as it is and nothing for released games', () => {
        expect(releaseBadge('2027-12-31', 'quarter', today)).toBe('Q4 2027');
        expect(releaseBadge('2028-12-31', 'year', today)).toBe('2028');
        expect(releaseBadge(null, null, today)).toBe('TBA');
        expect(releaseBadge('2026-12-31', 'year', '2027-01-01')).toBeNull();
        expect(releaseBadge('2020-05-01', 'day', today)).toBeNull();
    });
});
