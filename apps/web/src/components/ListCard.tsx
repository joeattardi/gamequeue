import { coverSrcSet, coverUrl } from '@gamequeue/shared';
import { Link } from 'react-router';

/** A list as a tile: its first covers, name and game count. Used by the Lists page and profiles. */
export function ListCard({
    to,
    name,
    count,
    covers
}: {
    to: string;
    name: string;
    count: number;
    covers: string[];
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
                    <strong>{name}</strong>
                    <span className="list-card__count">
                        {count} {count === 1 ? 'game' : 'games'}
                    </span>
                </span>
            </Link>
        </li>
    );
}
