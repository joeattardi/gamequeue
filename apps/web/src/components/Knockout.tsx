import { useEffect, useState } from 'react';
import { SkipForward } from 'lucide-react';
import { Cover } from './Cover';
import { shuffled } from './PickResult';

const TOTAL_MS = 7000;
const TOTAL_MS_REDUCED = 800;
const MIN_STEP_MS = 150;
/** The pause on the survivor before the result appears */
const FINALE_MS = 900;

/**
 * Time to wait before each of `count` eliminations: they speed along at first and slow towards
 * the end for tension, and the whole run stays about the same length however many games there are.
 */
export function knockoutDelays(count: number, reduced: boolean): number[] {
    if (count <= 0) return [];
    const weights = Array.from(
        { length: count },
        (_, i) => 1 + 3 * (i / Math.max(1, count - 1)) ** 2
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    const total = reduced ? TOTAL_MS_REDUCED : TOTAL_MS;
    return weights.map((w) =>
        reduced ? (total * w) / sum : Math.max(MIN_STEP_MS, (total * w) / sum)
    );
}

interface KnockoutGame {
    igdbId: number;
    name: string;
    coverImageId: string | null;
}

/**
 * "Last man standing": every contender is shown, the others drop out one by one at random and the
 * game left is the winner. The winner is decided up front; this only dramatises it, so the odds
 * are the same as a single pick. `onDone` fires after the finale or when skipped.
 */
export function Knockout({
    games,
    winnerId,
    onDone
}: {
    games: KnockoutGame[];
    winnerId: number;
    onDone: () => void;
}) {
    const [order] = useState(() => shuffled(games.filter((g) => g.igdbId !== winnerId)));
    const [out, setOut] = useState(0);
    const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    useEffect(() => {
        setOut(0);
        const delays = knockoutDelays(order.length, reduced);
        const timers: ReturnType<typeof setTimeout>[] = [];
        let at = 0;
        delays.forEach((d, i) => {
            at += d;
            timers.push(setTimeout(() => setOut(i + 1), at));
        });
        timers.push(setTimeout(onDone, at + (reduced ? 0 : FINALE_MS)));
        return () => timers.forEach(clearTimeout);
        // onDone is a fresh closure each render; the run must not restart because of that
    }, [order, reduced]);

    const gone = new Set(order.slice(0, out).map((g) => g.igdbId));
    const left = games.length - out;
    const last = order[out - 1];
    return (
        <div className="panel stack knockout">
            <div className="row pick-contenders__head">
                <h2 className="pick-contenders__title">
                    {left === 1 ? 'And the last one standing is…' : `${left} games left`}
                </h2>
                <button className="btn btn--ghost" onClick={onDone}>
                    <SkipForward />
                    Skip to the end
                </button>
            </div>
            <div className="sr-only" role="status">
                {last ? `${last.name} is out. ` : ''}
                {left === 1 ? 'One game left.' : `${left} games left.`}
            </div>
            <ul className="pick-contenders" aria-hidden="true">
                {games.map((g) => (
                    <li
                        key={g.igdbId}
                        className={[
                            'pick-contender',
                            'knockout__card',
                            gone.has(g.igdbId) ? 'knockout__card--out' : '',
                            left === 1 && g.igdbId === winnerId ? 'knockout__card--winner' : ''
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <Cover imageId={g.coverImageId} name={g.name} />
                    </li>
                ))}
            </ul>
        </div>
    );
}
