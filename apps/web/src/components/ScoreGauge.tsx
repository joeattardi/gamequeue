import { useEffect, useState } from 'react';
import {
    GAUGE_THRESHOLDS,
    arcPath,
    formatScore,
    gaugePercent,
    gaugeTier,
    markerRotation,
    polar,
    thresholdAngle
} from '../gauge';

/**
 * A small arc gauge for a score. The arc is red, yellow or green by tier (75+ / 50-74 / below 50,
 * see `gaugeTier`) on a lighter track of the same colour. Colour is never the only cue: the number
 * is real text, notches cut into the arc at the tier boundaries show which zone the end marker is
 * in, and the tier is in the accessible label and tooltip. The arc draws itself in on load.
 */
export function ScoreGauge({
    value,
    max = 100,
    label,
    size = 104
}: {
    value: number;
    max?: number;
    /** Short caption under the number, e.g. "IGDB" */
    label: string;
    /** Width and height in px */
    size?: number;
}) {
    const percent = gaugePercent(value, max);
    // Start empty and let CSS animate to the real value (instantly, if the user prefers reduced motion)
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setShown(percent));
        return () => cancelAnimationFrame(frame);
    }, [percent]);

    const stroke = Math.round(size * 0.085);
    const knob = stroke * 0.8;
    const r = size / 2 - knob - 3; // keeps the end marker and its ring inside the box
    const c = size / 2;
    const start = polar(c, c, r, 135);
    const text = formatScore(value);
    const tier = gaugeTier(percent);
    // Three characters (100, 10.5...) need a smaller face to clear the arc
    const valueScale = text.length >= 3 ? 0.27 : 0.34;
    // The caption won't fit under the number on a compact gauge; the accessible label still has it
    const showLabel = size >= 64;
    // Notches scale with the gauge so they stay crisp rather than busy at small sizes
    const notch = Math.max(1.5, size * 0.024);

    return (
        <div
            className={`gauge gauge--${tier}${showLabel ? '' : ' gauge--compact'}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={`${label} score: ${text} out of ${max}, ${tier}`}
            title={`${label} ${text}/${max}: ${tier}`}
        >
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
                <path
                    className="gauge__track"
                    d={arcPath(c, c, r)}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="none"
                />
                {percent > 0 && (
                    <path
                        className="gauge__fill"
                        d={arcPath(c, c, r)}
                        pathLength={100}
                        strokeDasharray={100}
                        strokeDashoffset={100 - shown}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="none"
                    />
                )}
                {/* Notches at the tier boundaries cut across the arc, so the zone reads without colour.
                    They sit above the arc but below the marker. */}
                {Object.values(GAUGE_THRESHOLDS).map((t) => {
                    const inner = polar(c, c, r - stroke / 2 - 1, thresholdAngle(t));
                    const outer = polar(c, c, r + stroke / 2 + 1, thresholdAngle(t));
                    return (
                        <line
                            key={t}
                            className="gauge__notch"
                            x1={inner.x}
                            y1={inner.y}
                            x2={outer.x}
                            y2={outer.y}
                            strokeWidth={notch}
                        />
                    );
                })}
                {percent > 0 && (
                    // The end marker sits at the arc's start and rotates to the value
                    <g
                        className="gauge__marker"
                        style={{ transform: `rotate(${markerRotation(shown)}deg)` }}
                    >
                        <circle
                            className="gauge__knob"
                            cx={start.x}
                            cy={start.y}
                            r={knob}
                            strokeWidth={2}
                        />
                    </g>
                )}
            </svg>
            <div className="gauge__text" aria-hidden="true">
                <span className="gauge__value" style={{ fontSize: size * valueScale }}>
                    {text}
                </span>
                {showLabel && (
                    <span className="gauge__label" style={{ fontSize: Math.max(11, size * 0.115) }}>
                        {label}
                    </span>
                )}
            </div>
        </div>
    );
}
