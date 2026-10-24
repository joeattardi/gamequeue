import type { DiscoverDto, DiscoverPickDto, SimilarGameDto } from '@gamequeue/shared';
import { Compass, Gift, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDiscover, useDismissGame } from '../api/discover';
import { useAddToWishlist } from '../api/wishlist';
import { Cover } from '../components/Cover';
import { usePageTitle } from '../lib';

function DiscoverSkeleton() {
    return (
        <section aria-busy="true">
            <div className="page-head">
                <div>
                    <h1>
                        <Compass aria-hidden="true" />
                        Discover
                    </h1>
                    <p className="muted">
                        <span className="skeleton skeleton--line skeleton--subtitle" />
                    </p>
                </div>
            </div>
            <ul className="grid" role="status" aria-label="Loading suggestions">
                {Array.from({ length: 12 }, (_, i) => (
                    <li
                        key={i}
                        className="card card--skeleton"
                        aria-hidden="true"
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    >
                        <span className="skeleton skeleton--card-cover" />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function DiscoverCard({
    game: g,
    onDismiss,
    onError
}: {
    game: SimilarGameDto | DiscoverPickDto;
    onDismiss: (g: SimilarGameDto) => void;
    onError: () => void;
}) {
    const addWish = useAddToWishlist();
    const because = 'becauseOf' in g ? g.becauseOf : [];
    const more = 'seedMatches' in g ? g.seedMatches - because.length : 0;
    return (
        <li className="card discover-card">
            <Link to={`/games/igdb/${g.igdbId}`} className="card__link">
                <div className="card__art">
                    <Cover imageId={g.coverImageId} name={g.name} size="cover_big" />
                </div>
                <span className="similar__title card__title">{g.name}</span>
                <span className="muted card__sub">
                    {g.year}
                    {because.length > 0 &&
                        `${g.year ? ' · ' : ''}Like ${because.join(', ')}${more > 0 ? ` +${more}` : ''}`}
                </span>
            </Link>
            <div className="discover-card__actions">
                <button
                    className="btn btn--small"
                    disabled={addWish.isPending}
                    aria-label={`Add ${g.name} to wishlist`}
                    onClick={() => addWish.mutate({ igdbId: g.igdbId }, { onError })}
                >
                    <Gift />
                    Wishlist
                </button>
                <button
                    className="btn btn--small"
                    aria-label={`Not interested in ${g.name}`}
                    title="Not interested"
                    onClick={() => onDismiss(g)}
                >
                    <X />
                </button>
            </div>
        </li>
    );
}

function DiscoverView({ data }: { data: DiscoverDto }) {
    const dismiss = useDismissGame();
    const [undo, setUndo] = useState<SimilarGameDto>();
    const [error, setError] = useState(false);
    const onDismiss = (g: SimilarGameDto) => {
        setError(false);
        dismiss.mutate(
            { igdbId: g.igdbId, dismissed: true },
            { onSuccess: () => setUndo(g), onError: () => setError(true) }
        );
    };
    const restore = () => {
        if (!undo) return;
        dismiss.mutate(
            { igdbId: undo.igdbId, dismissed: false },
            { onSuccess: () => setUndo(undefined), onError: () => setError(true) }
        );
    };
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Compass aria-hidden="true" />
                        Discover
                    </h1>
                    <p className="muted">
                        Based on {data.seedCount} {data.seedCount === 1 ? 'game' : 'games'} you
                        love: your favorites and anything you rated 4 stars or more.
                    </p>
                </div>
            </div>
            <p aria-live="polite" className="muted">
                {undo && (
                    <>
                        We won't suggest {undo.name} again.{' '}
                        <button className="btn btn--small" onClick={restore}>
                            Undo
                        </button>
                    </>
                )}
            </p>
            {error && (
                <p className="form-error" role="alert">
                    Something went wrong. Try again.
                </p>
            )}
            {data.picks.length === 0 ? (
                <p className="empty">
                    Nothing new to suggest right now. Favorite or rate more games, or check back
                    after you've dealt with these suggestions.
                </p>
            ) : (
                <>
                    <h2>Top picks</h2>
                    <ul className="grid">
                        {data.picks.map((g) => (
                            <DiscoverCard
                                key={g.igdbId}
                                game={g}
                                onDismiss={onDismiss}
                                onError={() => setError(true)}
                            />
                        ))}
                    </ul>
                    {data.rows.map((row) => (
                        <div key={row.seed.igdbId} className="stack discover-row">
                            <h2>
                                Because you loved{' '}
                                <Link to={`/games/${row.seed.entryId}`}>{row.seed.name}</Link>
                            </h2>
                            <ul className="grid">
                                {row.games.map((g) => (
                                    <DiscoverCard
                                        key={g.igdbId}
                                        game={g}
                                        onDismiss={onDismiss}
                                        onError={() => setError(true)}
                                    />
                                ))}
                            </ul>
                        </div>
                    ))}
                </>
            )}
        </section>
    );
}

/** Games like the ones you love, from IGDB's similar-game lists, minus what you own or wishlisted. */
export function DiscoverPage() {
    usePageTitle('Discover');
    const q = useDiscover();
    if (q.isPending) return <DiscoverSkeleton />;
    if (q.isError || !q.data)
        return (
            <p className="form-error" role="alert">
                Couldn't load suggestions right now.
            </p>
        );
    if (q.data.seedCount === 0)
        return (
            <section>
                <div className="page-head">
                    <h1>
                        <Compass aria-hidden="true" />
                        Discover
                    </h1>
                </div>
                <p className="empty">
                    Favorite or rate a few games (4 stars or more) and suggestions will show up
                    here. Start in your <Link to="/collection">collection</Link>.
                </p>
            </section>
        );
    return <DiscoverView data={q.data} />;
}
