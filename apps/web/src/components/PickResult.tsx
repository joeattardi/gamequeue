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

export function Rolling() {
    const [line, setLine] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setLine((l) => (l + 1) % ROLL_LINES.length), 750);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="pick-rolling panel" role="status">
            <div className="pick-rolling__deck" aria-hidden="true">
                <span className="pick-rolling__card" />
                <span className="pick-rolling__card" />
                <span className="pick-rolling__card" />
                <Dices className="pick-rolling__dice" />
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
