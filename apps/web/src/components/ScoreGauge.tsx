import { useEffect, useState } from 'react';
import { arcPath, formatScore, gaugePercent, markerRotation, polar } from '../gauge';

/**
 * A small arc gauge for a score. One hue (the accent) on a lighter track of the same hue, so it
 * never borrows red/green status colours. The number is real text in the middle, so the value
 * never depends on reading the arc. The arc draws itself in on load.
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
    // Three characters (100, 10.5...) need a smaller face to clear the arc
    const valueScale = text.length >= 3 ? 0.27 : 0.34;

    return (
        <div
            className="gauge"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`${label} score: ${formatScore(value)} out of ${max}`}
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
                    <>
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
                        {/* The end marker sits at the arc's start and rotates to the value */}
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
                    </>
                )}
            </svg>
            <div className="gauge__text" aria-hidden="true">
                <span className="gauge__value" style={{ fontSize: size * valueScale }}>
                    {text}
                </span>
                <span className="gauge__label" style={{ fontSize: Math.max(11, size * 0.115) }}>
                    {label}
                </span>
            </div>
        </div>
    );
}
