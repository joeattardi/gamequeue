import { useState, type KeyboardEvent } from 'react';

export interface DaySeries<T> {
    key: keyof T & string;
    label: string;
}

/** A count drawn as a dot under a day's column (a restart, say) instead of as part of the stack. */
export interface DayMarker<T> {
    label: string;
    count: (d: T) => number;
}

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
 * Stacked columns per day (the series are the stack, bottom first). Plain HTML/CSS like the other
 * charts: columns are capped in width with a 2px surface gap between segments and a rounded top,
 * the legend names the series (colour is never the only cue), a tooltip follows the pointer or the
 * arrow keys, and a visually hidden table carries every number. At most three series: those are the
 * colours checked with the dataviz validator (see `--day-1..3` in app.css).
 */
export function DayChart<T extends { day: string }>({
    days,
    series,
    marker,
    label
}: {
    days: T[];
    series: DaySeries<T>[];
    marker?: DayMarker<T>;
    /** What the chart counts, e.g. "Errors per day" */
    label: string;
}) {
    const [active, setActive] = useState<number | null>(null);
    const value = (d: T, s: DaySeries<T>) => d[s.key] as number;
    const total = (d: T) => series.reduce((n, s) => n + value(d, s), 0);
    const { top, ticks } = axis(Math.max(0, ...days.map(total)));
    const shown = active === null ? undefined : days[active];
    const stackOrder = series.map((s, i) => ({ s, i })).reverse(); // column order: top of the stack first

    const onKey = (e: KeyboardEvent) => {
        const last = days.length - 1;
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
        <figure className="day-chart">
            <ul className="day-chart__legend">
                {series.map((s, i) => (
                    <li key={s.key}>
                        <span
                            className={`day-chart__key day-chart__key--s${i + 1}`}
                            aria-hidden="true"
                        />
                        {s.label}
                    </li>
                ))}
                {marker && (
                    <li>
                        <span className="day-chart__dot" aria-hidden="true" />
                        {marker.label}
                    </li>
                )}
            </ul>
            <div className="day-chart__body">
                <div className="day-chart__axis" aria-hidden="true">
                    {ticks.map((t) => (
                        <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
                            {t}
                        </span>
                    ))}
                </div>
                <div
                    className="day-chart__plot"
                    tabIndex={0}
                    role="group"
                    aria-label={`${label} for the last ${days.length} days. Use the left and right arrow keys to read each day.`}
                    onKeyDown={onKey}
                    onBlur={() => setActive(null)}
                    onPointerLeave={() => setActive(null)}
                >
                    {ticks.map((t) => (
                        <div
                            key={t}
                            className="day-chart__grid"
                            style={{ bottom: `${(t / top) * 100}%` }}
                            aria-hidden="true"
                        />
                    ))}
                    <div className="day-chart__cols">
                        {days.map((d, i) => {
                            const topSeries = stackOrder.find(({ s }) => value(d, s) > 0)?.s;
                            return (
                                <div
                                    key={d.day}
                                    className={`day-chart__col${active === i ? ' is-active' : ''}`}
                                    onPointerEnter={() => setActive(i)}
                                    onPointerMove={() => setActive(i)}
                                >
                                    <div
                                        className="day-chart__stack"
                                        style={{ height: `${(total(d) / top) * 100}%` }}
                                    >
                                        {stackOrder.map(
                                            ({ s, i: n }) =>
                                                value(d, s) > 0 && (
                                                    <span
                                                        key={s.key}
                                                        className={`day-chart__seg day-chart__key--s${n + 1}${
                                                            s === topSeries ? ' is-top' : ''
                                                        }`}
                                                        style={{ flexGrow: value(d, s) }}
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
                            className="day-chart__tip"
                            style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
                            data-flip={active > days.length * 0.6 ? 'left' : 'right'}
                            aria-hidden="true"
                        >
                            <strong>
                                {date(shown.day, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </strong>
                            {series.map((s, i) => (
                                <div key={s.key} className="day-chart__tip-row">
                                    <span
                                        className={`day-chart__key day-chart__key--s${i + 1}`}
                                        aria-hidden="true"
                                    />
                                    <span className="day-chart__tip-value">
                                        {value(shown, s).toLocaleString()}
                                    </span>
                                    <span className="muted">{s.label}</span>
                                </div>
                            ))}
                            {marker && (
                                <div className="day-chart__tip-row">
                                    <span className="day-chart__dot" aria-hidden="true" />
                                    <span className="day-chart__tip-value">
                                        {marker.count(shown)}
                                    </span>
                                    <span className="muted">{marker.label}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {marker && (
                <div className="day-chart__marks" aria-hidden="true">
                    {days.map((d) => (
                        <span key={d.day} title={marker.count(d) > 0 ? marker.label : undefined}>
                            {marker.count(d) > 0 && <i className="day-chart__dot" />}
                        </span>
                    ))}
                </div>
            )}
            <div className="day-chart__x" aria-hidden="true">
                {days.map((d, i) => (
                    <span key={d.day}>
                        {i % 7 === days.length % 7
                            ? date(d.day, { month: 'short', day: 'numeric' })
                            : ''}
                    </span>
                ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
                {shown &&
                    `${date(shown.day, { dateStyle: 'full' })}: ${[
                        ...series.map((s) => `${value(shown, s)} ${s.label}`),
                        ...(marker ? [`${marker.count(shown)} ${marker.label}`] : [])
                    ].join(', ')}`}
            </p>
            <table className="sr-only">
                <caption>{label}</caption>
                <thead>
                    <tr>
                        <th scope="col">Day</th>
                        {series.map((s) => (
                            <th key={s.key} scope="col">
                                {s.label}
                            </th>
                        ))}
                        {marker && <th scope="col">{marker.label}</th>}
                    </tr>
                </thead>
                <tbody>
                    {days.map((d) => (
                        <tr key={d.day}>
                            <th scope="row">{d.day}</th>
                            {series.map((s) => (
                                <td key={s.key}>{value(d, s)}</td>
                            ))}
                            {marker && <td>{marker.count(d)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}

/** Placeholder with the chart's footprint. */
export function DayChartSkeleton({ label }: { label: string }) {
    return (
        <div className="day-chart" role="status" aria-label={label}>
            <div className="skeleton day-chart__skeleton" aria-hidden="true" />
        </div>
    );
}
