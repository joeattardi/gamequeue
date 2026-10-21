import { coverSrcSet, coverUrl } from '@gamequeue/shared';
import { WandSparkles } from 'lucide-react';
import { Link } from 'react-router';

/** A list as a tile: its first covers, name and game count. Used by the Lists page and profiles. */
export function ListCard({
    to,
    name,
    count,
    covers,
    smart = false
}: {
    to: string;
    name: string;
    count: number;
    covers: string[];
    /** A smart list: marked with a wand */
    smart?: boolean;
}) {
    return (
        <li>
            <Link to={to} className="list-card">
                {covers.length > 0 && (
                    <span className="list-card__covers" aria-hidden="true">
                        {covers.map((id) => (
                            <img
                                key={id}
                                src={coverUrl(id, 'cover_big')}
                                srcSet={coverSrcSet(id, 'cover_big')}
                                alt=""
                                loading="lazy"
                            />
                        ))}
                    </span>
                )}
                <span className="list-card__text">
                    <strong>
                        {smart && (
                            <WandSparkles
                                role="img"
                                aria-label="Smart list"
                                className="list-card__smart"
                            />
                        )}
                        {name}
                    </strong>
                    <span className="list-card__count">
                        {count} {count === 1 ? 'game' : 'games'}
                    </span>
                </span>
            </Link>
        </li>
    );
}
