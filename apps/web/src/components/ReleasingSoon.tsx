import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router';
import { useReleasingSoon } from '../api/wishlist';
import { releaseBadgeText, releaseText, todayLocal } from '../lib';
import { Cover } from './Cover';
import { ReleasingSoonSkeletons } from './HomeSkeletons';
import { MetaLine } from './MetaLine';

const WINDOW_DAYS = 14;

/** Wishlisted games with an exact release day in the next two weeks, soonest first. Hidden when none. */
export function ReleasingSoon() {
    const wishlist = useReleasingSoon(WINDOW_DAYS, todayLocal());
    if (wishlist.isError) return null;
    const items = wishlist.data ?? [];
    if (!wishlist.isPending && items.length === 0) return null;

    return (
        <section aria-labelledby="soon-h" className="home-section">
            <div className="page-head">
                <div>
                    <h2 id="soon-h">
                        <CalendarClock aria-hidden="true" />
                        Releasing soon
                    </h2>
                    <p className="muted">From your wishlist, in the next {WINDOW_DAYS} days.</p>
                </div>
                <Link className="btn" to="/wishlist">
                    View wishlist
                </Link>
            </div>
            {wishlist.isPending ? (
                <ReleasingSoonSkeletons />
            ) : (
                <ol className="grid upnext__list">
                    {items.map(({ igdbId, game, platform }) => (
                        <li key={igdbId} className="card">
                            <Link to={`/games/igdb/${igdbId}`} className="card__link">
                                <div className="card__art">
                                    <Cover imageId={game.coverImageId} name={game.name} />
                                    <span className="release-badge">{releaseBadgeText(game)}</span>
                                    <div className="card__info">
                                        <strong className="card__title">{game.name}</strong>
                                        <span className="muted card__sub">
                                            <MetaLine parts={[releaseText(game), platform?.name]} />
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
