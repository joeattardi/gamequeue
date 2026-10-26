import type { EntryDto } from '@gamequeue/shared';
import { Link } from 'react-router';
import { Cover } from './Cover';
import { EntryChips, EntrySub } from './GameCard';
import { reveal } from './motion';

/** One game as a compact row (the list layout of the collection and smart lists). */
export function GameRow({ entry }: { entry: EntryDto }) {
    const { game } = entry;
    return (
        <li ref={reveal}>
            <Link to={`/games/${entry.id}`} className="game-row">
                <Cover imageId={game.coverImageId} name={game.name} size="cover_small" />
                <span className="game-row__text">
                    <strong className="card__title">{game.name}</strong>
                    <EntrySub entry={entry} />
                </span>
                <EntryChips entry={entry} />
            </Link>
        </li>
    );
}
