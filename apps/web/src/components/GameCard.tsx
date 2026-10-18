import type { EntryDto } from '@gamequeue/shared';
import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { formatMinutes, yearOf } from '../lib';
import { Cover } from './Cover';
import { MetaLine } from './MetaLine';
import { PlatformTags } from './PlatformIcon';

export function EntrySub({ entry }: { entry: EntryDto }) {
    return (
        <span className="muted card__sub">
            <MetaLine
                parts={[
                    yearOf(entry.game.releaseDate),
                    <PlatformTags key="p" platforms={entry.platforms} />
                ]}
            />
        </span>
    );
}

export function EntryChips({ entry }: { entry: EntryDto }) {
    return (
        <span className="card__chips">
            {entry.status !== 'unplayed' && (
                <span className={`badge badge--${entry.status}`}>
                    {entry.status === 'finished' && entry.lastFinishedOn
                        ? `finished ${entry.lastFinishedOn.slice(0, 4)}`
                        : entry.status}
                </span>
            )}
            {entry.rating !== null && (
                <span className="badge">
                    <Star /> {entry.rating}
                </span>
            )}
            {entry.ttbMinutes !== null && (
                <span className="badge badge--quiet">{formatMinutes(entry.ttbMinutes)}</span>
            )}
        </span>
    );
}

/** Box art that links to the game; title and details show over it on hover or focus. */
export function GameCard({ entry, position }: { entry: EntryDto; position?: number }) {
    const { game } = entry;
    return (
        <li className="card">
            <Link to={`/games/${entry.id}`} className="card__link">
                <div className="card__art">
                    <Cover imageId={game.coverImageId} name={game.name} />
                    <div className="card__info">
                        <strong className="card__title">{game.name}</strong>
                        <EntrySub entry={entry} />
                        <EntryChips entry={entry} />
                    </div>
                    {position !== undefined && <span className="card__pos">{position}</span>}
                </div>
            </Link>
        </li>
    );
}
