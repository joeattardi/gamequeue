import { STATS_UNKNOWN_YEAR, type BreakdownRow, type StatsDto } from '@gamequeue/shared';
import type { CSSProperties } from 'react';
import { Star } from 'lucide-react';
import { formatMinutes } from '../lib';
import { CountUp } from './CountUp';
import { Cover } from './Cover';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => MONTHS[Number(m.slice(5)) - 1]!;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The stats page body. Works on a `StatsDto`, so the private and the public page share it. */
export function StatsView({ stats }: { stats: StatsDto }) {
    const { overview: o, finished, breakdowns, ratings, playtime } = stats;
    if (o.total === 0)
        return (
            <div className="empty">
                <p>
                    <strong>No games yet, so no stats.</strong>
                </p>
            </div>
        );
    const finishedTotal = finished.years.reduce((n, y) => n + y.count, 0);
    const backlogNote =
        o.backlogCount === 0
            ? undefined
            : o.backlogMinutes === 0
              ? 'no times known'
              : `about ${formatMinutes(o.backlogMinutes)} to clear${
                    o.backlogUnknown ? `, ${o.backlogUnknown} with no time` : ''
                }`;
    return (
        <div className="stack sv">
            <ul className="sv-tiles" aria-label="Overview">
                <Tile label="Games" value={o.total} />
                <Tile label="Backlog" value={o.backlogCount} note={backlogNote} />
                <Tile label="Finished" value={o.byStatus.finished} />
                <Tile
                    label="Average rating"
                    value={o.averageRating === null ? '—' : o.averageRating.toFixed(1)}
                    note={o.ratedCount ? plural(o.ratedCount, 'rated game') : 'nothing rated yet'}
                />
                <Tile
                    label="Play time"
                    value={playtime.playMinutes ? formatMinutes(playtime.playMinutes) : '—'}
                    note={
                        playtime.finishes
                            ? `from ${plural(playtime.finishes, 'finished playthrough')}${
                                  playtime.unrecordedCount
                                      ? `, ${playtime.unrecordedCount} with no time entered`
                                      : ''
                              }`
                            : undefined
                    }
                />
            </ul>
            <p className="muted sv-caveat">
                Play time adds up the hours entered when finishing a game. Finishes without a time
                entered aren't counted.
            </p>

            <section className="panel" aria-labelledby="sv-finished">
                <h2 id="sv-finished">Finished over time</h2>
                {finishedTotal === 0 ? (
                    <p className="muted">Nothing finished yet.</p>
                ) : (
                    <div className="sv-charts">
                        <BarChart
                            title="Last 12 months"
                            unit="game"
                            hue="var(--viz-1)"
                            data={finished.months.map((m) => ({
                                label: monthLabel(m.month),
                                full: `${monthLabel(m.month)} ${m.month.slice(0, 4)}`,
                                value: m.count
                            }))}
                        />
                        <BarChart
                            title="By year"
                            unit="game"
                            hue="var(--viz-2)"
                            data={finished.years.map((y) => ({
                                label: y.year === STATS_UNKNOWN_YEAR ? '?' : y.year,
                                full: y.year === STATS_UNKNOWN_YEAR ? 'Unknown date' : y.year,
                                value: y.count
                            }))}
                        />
                    </div>
                )}
            </section>

            <section className="panel" aria-labelledby="sv-breakdowns">
                <h2 id="sv-breakdowns">What's in the collection</h2>
                <p className="sv-legend muted" aria-hidden="true">
                    <span className="sv-key sv-key--finished" /> Finished
                    <span className="sv-key sv-key--all" /> All games
                </p>
                <div className="sv-charts">
                    <Breakdown title="Platforms" rows={breakdowns.platforms} hue="var(--viz-1)" />
                    <Breakdown title="Genres" rows={breakdowns.genres} hue="var(--viz-3)" />
                    <Breakdown title="Tags" rows={breakdowns.tags} hue="var(--viz-4)" />
                </div>
            </section>

            <section className="panel" aria-labelledby="sv-ratings">
                <h2 id="sv-ratings">Ratings</h2>
                {o.ratedCount === 0 ? (
                    <p className="muted">Nothing rated yet.</p>
                ) : (
                    <div className="sv-charts">
                        <BarChart
                            title="Games per rating"
                            unit="game"
                            data={ratings.distribution.map((d) => ({
                                label: `${d.rating}★`,
                                full: plural(d.rating, 'star'),
                                value: d.count,
                                color:
                                    d.rating >= 4
                                        ? 'var(--status-good)'
                                        : d.rating === 3
                                          ? 'var(--status-mid)'
                                          : 'var(--status-bad)'
                            }))}
                        />
                        <div>
                            <h3 className="sv-subtitle">Top rated</h3>
                            <ol className="sv-top">
                                {ratings.top.map((e) => (
                                    <li key={e.id}>
                                        <Cover
                                            imageId={e.game.coverImageId}
                                            name={e.game.name}
                                            size="cover_small"
                                        />
                                        <span>{e.game.name}</span>
                                        <span className="badge">
                                            <Star aria-hidden="true" /> {e.rating}
                                            <span className="sr-only"> stars</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
    return (
        <li className="sv-tile">
            <span className="sv-tile__value">
                <CountUp value={value} />
            </span>
            <span className="sv-tile__label">{label}</span>
            {note && <span className="muted sv-tile__note">{note}</span>}
        </li>
    );
}

interface Bar {
    label: string;
    /** Spelled out for the tooltip and the screen-reader table */
    full: string;
    value: number;
    /** Overrides the chart's colour for this bar */
    color?: string;
}

/** Vertical bars from a zero baseline. Values show over non-empty bars; a hidden table mirrors them. */
function BarChart({
    title,
    unit,
    data,
    hue = 'var(--viz-1)'
}: {
    title: string;
    unit: string;
    data: Bar[];
    hue?: string;
}) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <figure className="sv-chart">
            <figcaption className="sv-subtitle">{title}</figcaption>
            <div className="sv-bars" aria-hidden="true">
                {data.map((d, i) => (
                    <div
                        key={d.full}
                        className="sv-bar"
                        style={{ '--bar': d.color ?? hue, '--i': i } as CSSProperties}
                        title={`${d.full}: ${plural(d.value, unit)}`}
                    >
                        <span className="sv-bar__value">{d.value > 0 ? d.value : ''}</span>
                        <span className="sv-bar__track">
                            <span
                                className="sv-bar__fill"
                                style={{
                                    height:
                                        d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : 0
                                }}
                            />
                        </span>
                        <span className="sv-bar__label">{d.label}</span>
                    </div>
                ))}
            </div>
            <table className="sr-only">
                <caption>{title}</caption>
                <tbody>
                    {data.map((d) => (
                        <tr key={d.full}>
                            <th scope="row">{d.full}</th>
                            <td>{plural(d.value, unit)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}

/** Horizontal bars: the full track is every game, the solid part the finished ones. */
function Breakdown({ title, rows, hue }: { title: string; rows: BreakdownRow[]; hue: string }) {
    const max = Math.max(1, ...rows.map((r) => r.total));
    return (
        <div>
            <h3 className="sv-subtitle">{title}</h3>
            {rows.length === 0 ? (
                <p className="muted">None yet.</p>
            ) : (
                <ul className="sv-hbars">
                    {rows.map((r, i) => (
                        <li
                            key={r.name}
                            style={{ '--bar': hue, '--i': i } as CSSProperties}
                            title={`${r.name}: ${plural(r.total, 'game')}, ${r.finished} finished, ${r.unplayed} unplayed`}
                        >
                            <span className="sv-hbar__name">{r.name}</span>
                            <span className="sv-hbar__track" aria-hidden="true">
                                <span
                                    className="sv-hbar__all"
                                    style={{ width: `${(r.total / max) * 100}%` }}
                                >
                                    <span
                                        className="sv-hbar__done"
                                        style={{ width: `${(r.finished / r.total) * 100}%` }}
                                    />
                                </span>
                            </span>
                            <span className="sv-hbar__num">
                                {r.finished}/{r.total}
                                <span className="sr-only">
                                    {' '}
                                    finished, of {plural(r.total, 'game')}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
