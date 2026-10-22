import { useState, type KeyboardEvent } from 'react';
import { ERROR_GROUPS, type ErrorGroup, type ErrorHistoryDay } from '@gamequeue/shared';

const GROUPS = Object.keys(ERROR_GROUPS) as ErrorGroup[];
const total = (d: ErrorHistoryDay) => GROUPS.reduce((n, g) => n + d[g], 0);

/** Axis step so the tallest day fits in at most four whole-number gridlines. */
function axis(max: number) {
    let step = 1;
    for (let mag = 1; Math.ceil(max / step) > 4; mag *= 10)
        step = [1, 2, 5].map((m) => m * mag).find((s) => Math.ceil(max / s) <= 4) ?? mag * 10;
    const top = Math.max(1, Math.ceil(max / step)) * step;
    return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

// `YYYY-MM-DD` read as a plain calendar date, never through a time zone
const date = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

/**
 * Stacked columns of errors per day. Plain HTML/CSS like the other charts: columns are capped in
 * width with a 2px surface gap between segments and a rounded top, the legend names the series
 * (colour is never the only cue), a tooltip follows the pointer or the arrow keys, and a
 * visually hidden table carries every number.
 */
export function ErrorHistoryChart({ history }: { history: ErrorHistoryDay[] }) {
    const [active, setActive] = useState<number | null>(null);
    const { top, ticks } = axis(Math.max(0, ...history.map(total)));
    const shown = active === null ? undefined : history[active];

    const onKey = (e: KeyboardEvent) => {
        const last = history.length - 1;
        const at = active ?? last + 1;
        const next =
            e.key === 'ArrowLeft'
                ? Math.max(0, at - 1)
                : e.key === 'ArrowRight'
                  ? Math.min(last, at + 1)
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? last
                      : null;
        if (next === null) return;
        e.preventDefault();
        setActive(next);
    };

    return (
        <figure className="err-chart">
            <ul className="err-chart__legend">
                {GROUPS.map((g) => (
                    <li key={g}>
                        <span
                            className={`err-chart__key err-chart__key--${g}`}
                            aria-hidden="true"
                        />
                        {ERROR_GROUPS[g].label}
                    </li>
                ))}
            </ul>
            <div className="err-chart__body">
                <div className="err-chart__axis" aria-hidden="true">
                    {ticks.map((t) => (
                        <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
                            {t}
                        </span>
                    ))}
                </div>
                <div
                    className="err-chart__plot"
                    tabIndex={0}
                    role="group"
                    aria-label="Errors per day for the last 30 days. Use the left and right arrow keys to read each day."
                    onKeyDown={onKey}
                    onBlur={() => setActive(null)}
                    onPointerLeave={() => setActive(null)}
                >
                    {ticks.map((t) => (
                        <div
                            key={t}
                            className="err-chart__grid"
                            style={{ bottom: `${(t / top) * 100}%` }}
                            aria-hidden="true"
                        />
                    ))}
                    <div className="err-chart__cols">
                        {history.map((d, i) => {
                            const topGroup = [...GROUPS].reverse().find((g) => d[g] > 0);
                            return (
                                <div
                                    key={d.day}
                                    className={`err-chart__col${active === i ? ' is-active' : ''}`}
                                    onPointerEnter={() => setActive(i)}
                                    onPointerMove={() => setActive(i)}
                                >
                                    <div
                                        className="err-chart__stack"
                                        style={{ height: `${(total(d) / top) * 100}%` }}
                                    >
                                        {[...GROUPS]
                                            .reverse()
                                            .map(
                                                (g) =>
                                                    d[g] > 0 && (
                                                        <span
                                                            key={g}
                                                            className={`err-chart__seg err-chart__seg--${g}${
                                                                g === topGroup ? ' is-top' : ''
                                                            }`}
                                                            style={{ flexGrow: d[g] }}
                                                        />
                                                    )
                                            )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {shown && active !== null && (
                        <div
                            className="err-chart__tip"
                            style={{
                                left: `${((active + 0.5) / history.length) * 100}%`
                            }}
                            data-flip={active > history.length * 0.6 ? 'left' : 'right'}
                            aria-hidden="true"
                        >
                            <strong>
                                {date(shown.day, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </strong>
                            {GROUPS.map((g) => (
                                <div key={g} className="err-chart__tip-row">
                                    <span
                                        className={`err-chart__key err-chart__key--${g}`}
                                        aria-hidden="true"
                                    />
                                    <span className="err-chart__tip-value">{shown[g]}</span>
                                    <span className="muted">{ERROR_GROUPS[g].label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="err-chart__x" aria-hidden="true">
                {history.map((d, i) => (
                    <span key={d.day}>
                        {i % 7 === history.length % 7
                            ? date(d.day, { month: 'short', day: 'numeric' })
                            : ''}
                    </span>
                ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
                {shown &&
                    `${date(shown.day, { dateStyle: 'full' })}: ${GROUPS.map(
                        (g) => `${shown[g]} ${ERROR_GROUPS[g].label}`
                    ).join(', ')}`}
            </p>
            <table className="sr-only">
                <caption>Errors per day</caption>
                <thead>
                    <tr>
                        <th scope="col">Day</th>
                        {GROUPS.map((g) => (
                            <th key={g} scope="col">
                                {ERROR_GROUPS[g].label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {history.map((d) => (
                        <tr key={d.day}>
                            <th scope="row">{d.day}</th>
                            {GROUPS.map((g) => (
                                <td key={g}>{d[g]}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}

/** Placeholder with the chart's footprint. */
export function ErrorHistorySkeleton() {
    return (
        <div className="err-chart" role="status" aria-label="Loading error history">
            <div className="skeleton err-chart__skeleton" aria-hidden="true" />
        </div>
    );
}
