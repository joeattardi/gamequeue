import type { EntryDto } from '@gamequeue/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { needsPlatform, useSlots } from '../api/slots';
import { formatMinutes, yearOf } from '../lib';
import { MetaLine } from './MetaLine';
import { PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { useAssign } from './useAssign';
import { ArrowRight, Dices, RefreshCw, SlidersHorizontal } from 'lucide-react';

const ROLL_MS = 2200;
const ROLL_MS_REDUCED = 600;

/** How long the shuffle shows before a result appears; shorter with reduced motion. */
export function rollDelay(): Promise<void> {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise((resolve) => setTimeout(resolve, reduced ? ROLL_MS_REDUCED : ROLL_MS));
}

export const ROLL_LINES = ['Shuffling your games…', 'Weighing the options…', 'Consulting fate…'];

/** Fisher-Yates, so the covers don't flash by in the order the games were added. */
function shuffled<T>(xs: T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
}

/** How often the covers on the shuffling cards change. */
const COVER_SWAP_MS = 450;

/**
 * The shuffling-cards wait. With `covers` (the games in the running) the cards show their art,
 * changing as they shuffle; without, they're blank and the dice spins on top.
 */
export function Rolling({ covers }: { covers?: { imageId: string | null; name: string }[] }) {
    const [line, setLine] = useState(0);
    const [tick, setTick] = useState(0);
    const [order] = useState(() => (covers ? shuffled(covers) : []));
    // With reduced motion the cards hold still, so the art isn't flashing either
    const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const t = setInterval(() => setLine((l) => (l + 1) % ROLL_LINES.length), 750);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        if (order.length === 0 || reduced) return;
        const t = setInterval(() => setTick((n) => n + 1), COVER_SWAP_MS);
        return () => clearInterval(t);
    }, [order.length, reduced]);
    return (
        <div className="pick-rolling panel" role="status">
            <div className="pick-rolling__deck" aria-hidden="true">
                {[0, 1, 2].map((i) => {
                    const game = order.length ? order[(tick * 3 + i) % order.length] : undefined;
                    return (
                        <span key={i} className="pick-rolling__card">
                            {game && <Cover imageId={game.imageId} name={game.name} />}
                        </span>
                    );
                })}
                {order.length === 0 && <Dices className="pick-rolling__dice" />}
            </div>
            <p className="pick-rolling__text">{ROLL_LINES[line]}</p>
        </div>
    );
}

export function PickResult({
    note,
    entry,
    onReroll,
    onPickAgain,
    againLabel = 'Pick again'
}: {
    /** Muted line above the title, e.g. how many games were in the running */
    note: string;
    entry: EntryDto;
    onReroll: () => void;
    onPickAgain: () => void;
    againLabel?: string;
}) {
    const { game } = entry;
    const slots = useSlots();
    const { assignTo, pending, error } = useAssign();
    const [platformId, setPlatformId] = useState('');
    const [placedIn, setPlacedIn] = useState<string>();
    const platformNeeded = needsPlatform(entry);

    return (
        <article className="pick-result panel">
            <div className="pick-result__cover">
                <Cover imageId={game.coverImageId} name={game.name} />
            </div>
            <div className="stack">
                <p className="muted">{note}</p>
                <h2 className="pick-result__title">{game.name}</h2>
                <p className="muted">
                    <MetaLine
                        parts={[
                            yearOf(game.releaseDate),
                            game.genres.join(', '),
                            <PlatformTags key="p" platforms={entry.platforms} />,
                            entry.ttbMinutes !== null
                                ? `~${formatMinutes(entry.ttbMinutes)} to beat`
                                : null,
                            game.igdbRating !== null ? `IGDB ${game.igdbRating}` : null
                        ]}
                    />
                </p>
                {entry.status === 'paused' && <span className="badge badge--paused">paused</span>}
                {game.summary && <p className="summary summary--clamp">{game.summary}</p>}

                {placedIn ? (
                    <p role="status">
                        <strong>Now playing in {placedIn}.</strong>{' '}
                        <Link to="/">See your slots</Link>
                    </p>
                ) : (
                    <>
                        {platformNeeded && (
                            <label className="field">
                                <span>Playing it on</span>
                                <select
                                    value={platformId}
                                    onChange={(e) => setPlatformId(e.target.value)}
                                >
                                    <option value="">Choose a platform…</option>
                                    {entry.platforms.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="row">
                            {slots.data?.map((slot, i) => (
                                <button
                                    key={slot.id}
                                    className={i === 0 ? 'btn btn--primary' : 'btn'}
                                    disabled={pending || (platformNeeded && !platformId)}
                                    onClick={() =>
                                        assignTo(slot, entry, {
                                            platformId: platformId ? Number(platformId) : undefined,
                                            onDone: () => setPlacedIn(slot.name)
                                        })
                                    }
                                >
                                    Make this my {slot.name}
                                </button>
                            ))}
                        </div>
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                        <div className="row">
                            <button className="btn" onClick={onReroll}>
                                <RefreshCw />
                                Re-roll
                            </button>
                            <button className="btn" onClick={onPickAgain}>
                                <SlidersHorizontal />
                                {againLabel}
                            </button>
                            <Link className="btn btn--ghost" to={`/games/${entry.id}`}>
                                Open game
                                <ArrowRight />
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </article>
    );
}
