import type { RecapDto, PublicEntryDto } from '@gamequeue/shared';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import { formatMinutes } from '../lib';
import { Cover } from './Cover';

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const longDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

function Card({
    n,
    id,
    title,
    children,
    className = ''
}: {
    n: number;
    id: string;
    title: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={`rc-card rc-card--${(n % 5) + 1} ${className}`}
            style={{ '--i': n } as CSSProperties}
            aria-labelledby={id}
        >
            <h2 id={id} className="rc-eyebrow">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Game({ entry, note }: { entry: PublicEntryDto; note: ReactNode }) {
    return (
        <div className="rc-game">
            <Cover imageId={entry.game.coverImageId} name={entry.game.name} size="cover_big" />
            <div>
                <strong>{entry.game.name}</strong>
                <span>{note}</span>
            </div>
        </div>
    );
}

function Ranking({ title, rows }: { title: string; rows: RecapDto['topGenres'] }) {
    return (
        <div>
            <h3 className="rc-sub">{title}</h3>
            <ol className="rc-rank">
                {rows.map((r) => (
                    <li key={r.name}>
                        <span>{r.name}</span>
                        <span className="rc-rank__n">{plural(r.count, 'game')}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/** "The year in review". Works on a `RecapDto`, so the private and the public page share it. */
export function RecapView({ recap, basePath }: { recap: RecapDto; basePath: string }) {
    const r = recap;
    const nav = r.years.length > 1 && (
        <nav className="rc-years" aria-label="Year">
            {r.years.map((y) => (
                <Link
                    key={y}
                    to={`${basePath}/${y}`}
                    className="rc-year"
                    aria-current={y === r.year ? 'page' : undefined}
                >
                    {y}
                </Link>
            ))}
        </nav>
    );

    if (r.finishedGames === 0 && r.abandonedGames === 0 && r.startedCount === 0)
        return (
            <div className="stack">
                {nav}
                <div className="empty">
                    <p>
                        <strong>Nothing finished in {r.year}.</strong>
                    </p>
                    <p className="muted">
                        {r.years.length
                            ? 'Pick another year above.'
                            : 'Finish a game and it will show up here.'}
                    </p>
                </div>
            </div>
        );

    const diff = r.finishedGames - r.previousFinishedGames;
    const compare =
        r.previousFinishedGames === 0
            ? null
            : diff === 0
              ? `The same as ${r.year - 1}.`
              : `${plural(Math.abs(diff), 'game')} ${diff > 0 ? 'more' : 'fewer'} than ${r.year - 1}.`;
    const days = r.estimatedMinutes / 60 / 24;
    const peak = Math.max(1, ...r.months);
    let n = 0;

    return (
        <div className="stack rc">
            {nav}

            <Card n={n++} id="rc-hero" title={`${r.year} in games`} className="rc-card--hero">
                <p className="rc-big">{r.finishedGames}</p>
                <p className="rc-lead">
                    {r.finishedGames === 1 ? 'game finished' : 'games finished'}
                </p>
                {compare && <p className="rc-note">{compare}</p>}
                <ul className="rc-chips">
                    {r.startedCount > 0 && <li>{plural(r.startedCount, 'game')} started</li>}
                    {r.abandonedGames > 0 && <li>{r.abandonedGames} dropped</li>}
                    {r.replays > 0 && <li>{plural(r.replays, 'replay')}</li>}
                </ul>
            </Card>

            {r.finishedGames > 0 && r.estimatedMinutes > 0 && (
                <Card n={n++} id="rc-time" title="Time well spent">
                    <p className="rc-big">{formatMinutes(r.estimatedMinutes)}</p>
                    <p className="rc-lead">
                        of play time
                        {days >= 1 && ` — about ${days.toFixed(1)} days nonstop`}
                    </p>
                    <p className="rc-note">
                        An estimate: each finish counts the game's time to beat
                        {r.unknownTimeCount > 0 &&
                            `, and ${plural(r.unknownTimeCount, 'finish', 'finishes')} had no time to count`}
                        .
                    </p>
                </Card>
            )}

            {r.busiestMonth !== null && (
                <Card n={n++} id="rc-rhythm" title="Your rhythm">
                    <p className="rc-lead rc-lead--top">
                        <strong>{MONTHS[r.busiestMonth - 1]}</strong> was your busiest month, with{' '}
                        {plural(r.months[r.busiestMonth - 1]!, 'game')} finished.
                    </p>
                    <ol className="rc-months" aria-label="Games finished per month">
                        {r.months.map((count, i) => (
                            <li
                                key={MONTHS[i]}
                                className={i + 1 === r.busiestMonth ? 'is-peak' : undefined}
                            >
                                <span className="rc-month__n" aria-hidden="true">
                                    {count || ''}
                                </span>
                                <span className="rc-month__track" aria-hidden="true">
                                    <span
                                        className="rc-month__bar"
                                        style={
                                            {
                                                height: count
                                                    ? `${Math.max(4, (count / peak) * 100)}%`
                                                    : 0,
                                                '--i': i
                                            } as CSSProperties
                                        }
                                    />
                                </span>
                                <span className="rc-month__label" aria-hidden="true">
                                    {MONTHS[i]!.slice(0, 3)}
                                </span>
                                <span className="sr-only">
                                    {MONTHS[i]}: {plural(count, 'game')}
                                </span>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}

            {(r.topGenres.length > 0 || r.topPlatforms.length > 0) && (
                <Card n={n++} id="rc-taste" title="Your taste">
                    <div className="rc-cols">
                        {r.topGenres.length > 0 && <Ranking title="Genres" rows={r.topGenres} />}
                        {r.topPlatforms.length > 0 && (
                            <Ranking title="Platforms" rows={r.topPlatforms} />
                        )}
                    </div>
                </Card>
            )}

            {r.topRated.length > 0 && (
                <Card n={n++} id="rc-fav" title="Your favourites">
                    <p className="rc-lead rc-lead--top">
                        {r.averageRating !== null && (
                            <>
                                You rated your {r.year} finishes <strong>{r.averageRating}</strong>{' '}
                                on average.
                            </>
                        )}
                    </p>
                    <ol className="rc-shelf">
                        {r.topRated.map((e) => (
                            <li key={e.id}>
                                <Cover
                                    imageId={e.game.coverImageId}
                                    name={e.game.name}
                                    size="cover_big"
                                />
                                <span className="rc-shelf__name">{e.game.name}</span>
                                <span className="rc-stars">
                                    <Star aria-hidden="true" /> {e.rating}
                                    <span className="sr-only"> stars</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}

            {(r.longest || r.longestHaul || r.firstFinish) && (
                <Card n={n++} id="rc-moments" title="Moments">
                    <div className="rc-games">
                        {r.firstFinish && (
                            <Game
                                entry={r.firstFinish.entry}
                                note={`First finish of the year, ${longDate(r.firstFinish.on)}`}
                            />
                        )}
                        {r.longest && (
                            <Game
                                entry={r.longest.entry}
                                note={`The longest: ${formatMinutes(r.longest.minutes)} to beat`}
                            />
                        )}
                        {r.shortest && (
                            <Game
                                entry={r.shortest.entry}
                                note={`The quickest: ${formatMinutes(r.shortest.minutes)} to beat`}
                            />
                        )}
                        {r.longestHaul && r.longestHaul.days > 0 && (
                            <Game
                                entry={r.longestHaul.entry}
                                note={`The long haul: ${plural(r.longestHaul.days, 'day')} from start to finish`}
                            />
                        )}
                        {r.lastFinish && r.lastFinish.entry.id !== r.firstFinish?.entry.id && (
                            <Game
                                entry={r.lastFinish.entry}
                                note={`Latest finish, ${longDate(r.lastFinish.on)}`}
                            />
                        )}
                    </div>
                </Card>
            )}

            {r.addedCount > 0 && (
                <Card n={n++} id="rc-shelf" title="The shelf">
                    <p className="rc-big">+{r.addedCount}</p>
                    <p className="rc-lead">
                        {r.addedCount === 1 ? 'game' : 'games'} added, {r.finishedGames} finished
                    </p>
                    <p className="rc-note">
                        {r.addedCount > r.finishedGames
                            ? `The collection grew by ${r.addedCount - r.finishedGames} more than you cleared.`
                            : r.addedCount < r.finishedGames
                              ? 'You finished more than you added. The backlog thanks you.'
                              : 'You finished exactly as many as you added.'}
                    </p>
                </Card>
            )}

            {r.archetype && (
                <Card n={n++} id="rc-type" title={`Your ${r.year} player type`}>
                    <p className="rc-type">{r.archetype.title}</p>
                    <p className="rc-lead">{r.archetype.blurb}</p>
                </Card>
            )}

            {r.games.length > 0 && (
                <section
                    className="panel"
                    aria-labelledby="rc-wall"
                    style={{ '--i': n } as CSSProperties}
                >
                    <h2 id="rc-wall">Everything you finished in {r.year}</h2>
                    <ul className="rc-wall">
                        {r.games.map((e) => (
                            <li key={e.id} title={e.game.name}>
                                <Cover
                                    imageId={e.game.coverImageId}
                                    name={e.game.name}
                                    size="cover_big"
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
