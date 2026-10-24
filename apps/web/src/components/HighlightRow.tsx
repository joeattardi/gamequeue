import type { PublicEntryDto } from '@gamequeue/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Cover } from './Cover';
import { StarDisplay } from './StarRating';

const GAP = 14;
const MIN_TILE = 100;
/** Tiles per row, the "more" tile included: 3 games at the narrowest, 5 at the widest. */
const MIN_COLS = 4;
const MAX_COLS = 6;

/** How many tiles fit in a row of this width. */
export const columnsFor = (width: number) =>
    Math.min(MAX_COLS, Math.max(MIN_COLS, Math.floor((width + GAP) / (MIN_TILE + GAP))));

/**
 * What a row shows: every game when they all fit, otherwise one fewer than the columns so the last
 * tile can say how many more there are. `total` can exceed `games` (the profile only sends a few).
 */
export function rowLayout(games: number, total: number, cols: number) {
    if (total <= cols && games === total) return { shown: games, more: 0 };
    const shown = Math.min(games, cols - 1);
    return { shown, more: Math.max(0, total - shown) };
}

/**
 * A heading and one row of covers, each linking to the game's page: the profile's highlight
 * reels (recently finished, favorites). As many games as fit are shown, then a game-shaped tile
 * saying how many more there are, which links to the full list.
 */
export function HighlightRow({
    id,
    title,
    username,
    entries,
    seeAll
}: {
    id: string;
    title: string;
    username: string;
    entries: PublicEntryDto[];
    seeAll: { to: string; count: number; noun: string };
}) {
    const list = useRef<HTMLUListElement>(null);
    const [cols, setCols] = useState(5);
    useLayoutEffect(() => {
        const el = list.current;
        if (!el) return;
        const measure = () => setCols(columnsFor(el.clientWidth));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [entries.length]);

    if (entries.length === 0) return null;
    const { shown, more } = rowLayout(entries.length, seeAll.count, cols);
    return (
        <section aria-labelledby={id}>
            <h2 id={id}>{title}</h2>
            <ul
                ref={list}
                className="highlight"
                aria-labelledby={id}
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {entries.slice(0, shown).map((e) => (
                    <li key={e.id}>
                        <Link to={`/u/${username}/games/${e.game.id}`} className="game-link">
                            <Cover imageId={e.game.coverImageId} name={e.game.name} />
                            <span className="highlight__name">{e.game.name}</span>
                        </Link>
                        {e.rating !== null && <StarDisplay value={e.rating} />}
                    </li>
                ))}
                {more > 0 && (
                    <li>
                        <Link
                            to={seeAll.to}
                            className="highlight__more"
                            aria-label={`See all ${seeAll.count} ${seeAll.noun}`}
                        >
                            <strong>{more}</strong>
                            <span>more</span>
                        </Link>
                    </li>
                )}
            </ul>
        </section>
    );
}
