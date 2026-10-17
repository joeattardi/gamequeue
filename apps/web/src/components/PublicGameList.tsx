import type { PublicEntryDto } from '@gamequeue/shared';
import { Cover } from './Cover';
import { StarDisplay } from './StarRating';

/** The one layout shared by every public profile sub-page (`/u/:username/:view`). */
export function PublicGameList({
    entries,
    numbered = false,
    empty
}: {
    entries: PublicEntryDto[];
    /** Show each game's position, for ordered lists such as the queue */
    numbered?: boolean;
    empty: string;
}) {
    if (entries.length === 0) return <p className="muted">{empty}</p>;
    return (
        <ol className="public-games">
            {entries.map((e, i) => (
                <li key={e.id}>
                    {numbered && <span className="public-games__pos">{i + 1}</span>}
                    <Cover imageId={e.game.coverImageId} name={e.game.name} />
                    <div>
                        <strong>{e.game.name}</strong>
                        <div>
                            <span className={`badge badge--${e.status}`}>{e.status}</span>
                            {e.rating !== null && <StarDisplay value={e.rating} />}
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    );
}
