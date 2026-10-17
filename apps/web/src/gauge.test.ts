import { describe, expect, it } from 'vitest';
import {
    GAUGE_START,
    GAUGE_SWEEP,
    arcPath,
    formatScore,
    gaugePercent,
    markerRotation,
    polar
} from './gauge';

describe('gaugePercent', () => {
    it('maps a value onto 0-100 of its maximum', () => {
        expect(gaugePercent(93, 100)).toBe(93);
        expect(gaugePercent(7, 10)).toBeCloseTo(70);
        expect(gaugePercent(0, 100)).toBe(0);
    });

    it('clamps out-of-range values', () => {
        expect(gaugePercent(130, 100)).toBe(100);
        expect(gaugePercent(-5, 100)).toBe(0);
    });

    it('treats unusable input as empty rather than throwing', () => {
        expect(gaugePercent(Number.NaN, 100)).toBe(0);
        expect(gaugePercent(50, 0)).toBe(0);
        expect(gaugePercent(50, -10)).toBe(0);
        expect(gaugePercent(Infinity, 100)).toBe(0);
    });
});

describe('arc geometry', () => {
    it('starts bottom-left and ends bottom-right of the circle', () => {
        const start = polar(50, 50, 40, GAUGE_START);
        const end = polar(50, 50, 40, GAUGE_START + GAUGE_SWEEP);
        expect(start.x).toBeCloseTo(50 - 40 * Math.SQRT1_2);
        expect(start.y).toBeCloseTo(50 + 40 * Math.SQRT1_2);
        expect(end.x).toBeCloseTo(50 + 40 * Math.SQRT1_2);
        expect(end.y).toBeCloseTo(50 + 40 * Math.SQRT1_2);
    });

    it('peaks at 12 o clock halfway through the sweep', () => {
        const top = polar(50, 50, 40, GAUGE_START + GAUGE_SWEEP / 2);
        expect(top.x).toBeCloseTo(50);
        expect(top.y).toBeCloseTo(10);
    });

    it('draws a clockwise large arc between those points', () => {
        expect(arcPath(50, 50, 40)).toMatch(/^M [\d.]+ [\d.]+ A 40 40 0 1 1 [\d.]+ [\d.]+$/);
    });

    it('rotates the marker proportionally along the sweep', () => {
        expect(markerRotation(0)).toBe(0);
        expect(markerRotation(50)).toBe(135);
        expect(markerRotation(100)).toBe(270);
    });
});

describe('formatScore', () => {
    it('keeps whole numbers whole and rounds others to one decimal', () => {
        expect(formatScore(93)).toBe('93');
        expect(formatScore(7.5)).toBe('7.5');
        expect(formatScore(7.25)).toBe('7.3');
    });
});
