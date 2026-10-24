import type { PublicEntryDto } from '@gamequeue/shared';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Cover } from './Cover';
import { StarDisplay } from './StarRating';

/**
 * A heading and a single scrolling row of covers, each linking to the game's page: the profile's
 * highlight reels (recently finished, favorites). `seeAll` links to the full list.
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
    seeAll: { to: string; count: number };
}) {
    if (entries.length === 0) return null;
    return (
        <section aria-labelledby={id}>
            <div className="highlight__head">
                <h2 id={id}>{title}</h2>
                <Link to={seeAll.to} className="highlight__all">
                    See all {seeAll.count}
                    <ChevronRight aria-hidden="true" />
                </Link>
            </div>
            <ul className="highlight" aria-labelledby={id}>
                {entries.map((e) => (
                    <li key={e.id}>
                        <Link to={`/u/${username}/games/${e.game.id}`} className="game-link">
                            <Cover imageId={e.game.coverImageId} name={e.game.name} />
                            <span className="highlight__name">{e.game.name}</span>
                        </Link>
                        {e.rating !== null && <StarDisplay value={e.rating} />}
                    </li>
                ))}
            </ul>
        </section>
    );
}
