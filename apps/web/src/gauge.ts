/**
 * Geometry for a 270° arc gauge that opens at the bottom.
 * Angles are SVG degrees: 0° is 3 o'clock and they increase clockwise (y points down),
 * so 135° is bottom-left and the arc sweeps clockwise to 45° (bottom-right).
 */
export const GAUGE_START = 135;
export const GAUGE_SWEEP = 270;

/** 0-100, clamped. Anything that isn't a finite number reads as 0. */
export function gaugePercent(value: number, max: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return Math.min(100, Math.max(0, (value / max) * 100));
}

export function polar(cx: number, cy: number, r: number, degrees: number) {
    const rad = (degrees * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Path for the full 270° track (the filled part is this same path, partly dashed). */
export function arcPath(cx: number, cy: number, r: number): string {
    const a = polar(cx, cy, r, GAUGE_START);
    const b = polar(cx, cy, r, GAUGE_START + GAUGE_SWEEP);
    // large-arc=1 (270° > 180°), sweep=1 (clockwise)
    return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 1 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}

/** How far to rotate the end marker, from the start of the arc, for a given percentage. */
export const markerRotation = (percent: number) => (percent / 100) * GAUGE_SWEEP;

/** "93", "7.5": whole numbers stay whole, others get one decimal. */
export const formatScore = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Score tiers, using the familiar Metacritic cut-offs: 75+ is favorable, 50-74 mixed, below 50
 * unfavorable. Applied to the percentage so a 7.5/10 rating reads the same as a 75/100 score.
 */
export const GAUGE_THRESHOLDS = { mixed: 50, favorable: 75 } as const;

export type GaugeTier = 'unfavorable' | 'mixed' | 'favorable';

export function gaugeTier(percent: number): GaugeTier {
    if (percent >= GAUGE_THRESHOLDS.favorable) return 'favorable';
    if (percent >= GAUGE_THRESHOLDS.mixed) return 'mixed';
    return 'unfavorable';
}

/** Where a threshold falls around the circle, in SVG degrees. */
export const thresholdAngle = (percent: number) => GAUGE_START + (percent / 100) * GAUGE_SWEEP;
