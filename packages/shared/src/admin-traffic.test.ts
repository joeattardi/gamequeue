import { describe, expect, it } from 'vitest';
import { trafficTotals, type TrafficDayDto } from './admin-traffic.js';

const d = (day: string, requests: number, cached: number, uniques: number): TrafficDayDto => ({
    day,
    requests,
    cached,
    uncached: requests - cached,
    pageViews: requests / 10,
    uniques,
    bytes: requests * 100
});

describe('trafficTotals', () => {
    const days = [d('a', 100, 50, 4), d('b', 200, 150, 6), d('c', 100, 0, 5)];
    it('sums the newest days', () => {
        expect(trafficTotals(days, 2)).toEqual({
            requests: 300,
            pageViews: 30,
            bytes: 30_000,
            cachedPercent: 50,
            avgVisitors: 6 // (6 + 5) / 2, rounded
        });
    });
    it('covers everything when asked for more days than there are', () => {
        expect(trafficTotals(days, 30).requests).toBe(400);
    });
    it('has no cache rate without requests', () => {
        expect(trafficTotals([d('a', 0, 0, 0)], 7)).toMatchObject({
            cachedPercent: null,
            avgVisitors: 0
        });
        expect(trafficTotals([], 7)).toMatchObject({ requests: 0, cachedPercent: null });
    });
});
