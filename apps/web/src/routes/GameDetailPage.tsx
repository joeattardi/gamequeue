import type { GameDetailDto, SearchResultDto } from '@gamequeue/shared';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useGameDetail } from '../api/collection';
import { useAddToWishlist, useRemoveFromWishlist } from '../api/wishlist';
import { AddGameDialog } from '../components/AddGameDialog';
import { GameOffers } from '../components/GameOffers';
import { Cover } from '../components/Cover';
import { Screenshots } from '../components/Screenshots';
import { EntrySkeleton } from '../components/PageSkeletons';
import { PlatformTags } from '../components/PlatformIcon';
import { SeriesLinks } from '../components/SeriesLinks';
import { ScoreGauge } from '../components/ScoreGauge';
import { formatMinutes, usePageTitle, yearOf } from '../lib';
import { Gift, Library, X } from 'lucide-react';

/**
 * A game by IGDB id, for games that aren't in the collection yet. Owned games redirect to their
 * own page, which has everything this one shows and more.
 */
export function GameDetailPage() {
    const igdbId = Number(useParams().igdbId);
    const detail = useGameDetail(igdbId);
    usePageTitle(detail.data?.game.name);
    if (detail.isPending) return <EntrySkeleton />;
    if (detail.isError || !detail.data)
        return (
            <div className="empty">
                <p>
                    <strong>
                        {detail.error instanceof ApiRequestError
                            ? detail.error.message
                            : "Couldn't load that game."}
                    </strong>
                </p>
                <Link to="/search">Back to search</Link>
            </div>
        );
    if (detail.data.entryId !== null)
        return <Navigate to={`/games/${detail.data.entryId}`} replace />;
    return <GameDetail detail={detail.data} />;
}

function GameDetail({ detail }: { detail: GameDetailDto }) {
    const { game, wishlisted } = detail;
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string>();
    const addWish = useAddToWishlist();
    const removeWish = useRemoveFromWishlist();
    const fail = (e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    const asResult: SearchResultDto = {
        igdbId: game.id,
        name: game.name,
        year: game.releaseDate ? Number(game.releaseDate.slice(0, 4)) : null,
        coverImageId: game.coverImageId,
        igdbRating: game.igdbRating,
        platforms: game.platforms,
        entryId: null,
        wishlisted
    };

    return (
        <article className="entry">
            <div className="entry__layout">
                <div className="entry__cover">
                    <Cover imageId={game.coverImageId} name={game.name} size="720p" />
                    <Screenshots imageIds={game.screenshots} name={game.name} />
                </div>
                <div className="stack">
                    <header className="entry__head">
                        <div>
                            <h1>{game.name}</h1>
                            <p className="muted">
                                {[yearOf(game.releaseDate), game.genres.join(', ')]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                            <SeriesLinks series={game.series} />
                        </div>
                        {game.igdbRating !== null && (
                            <ScoreGauge value={game.igdbRating} label="IGDB" />
                        )}
                    </header>
                    {game.summary && <p className="summary">{game.summary}</p>}

                    <section aria-labelledby="own-h" className="panel stack">
                        <h2 id="own-h">Your copy</h2>
                        <p className="muted">
                            {wishlisted ? 'On your wishlist.' : "You don't own this game yet."}
                        </p>
                        <div className="game-actions">
                            <button className="btn btn--primary" onClick={() => setAdding(true)}>
                                <Library />
                                Add to collection
                            </button>
                            {wishlisted ? (
                                <button
                                    className="btn"
                                    disabled={removeWish.isPending}
                                    onClick={() => {
                                        setError(undefined);
                                        removeWish.mutate(game.id, { onError: fail });
                                    }}
                                >
                                    <X />
                                    Remove from wishlist
                                </button>
                            ) : (
                                <button
                                    className="btn"
                                    disabled={addWish.isPending}
                                    onClick={() => {
                                        setError(undefined);
                                        addWish.mutate({ igdbId: game.id }, { onError: fail });
                                    }}
                                >
                                    <Gift />
                                    Add to wishlist
                                </button>
                            )}
                        </div>
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                    </section>

                    <GameOffers igdbId={game.id} />

                    <section aria-labelledby="ttb-h" className="panel">
                        <h2 id="ttb-h">Time to beat</h2>
                        {game.ttb ? (
                            <dl className="ttb">
                                <div>
                                    <dt>Hasty</dt>
                                    <dd>{formatMinutes(game.ttb.hastily)}</dd>
                                </div>
                                <div>
                                    <dt>Normal</dt>
                                    <dd>{formatMinutes(game.ttb.normally)}</dd>
                                </div>
                                <div>
                                    <dt>Completionist</dt>
                                    <dd>{formatMinutes(game.ttb.completely)}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="muted">IGDB has no time-to-beat data for this game.</p>
                        )}
                    </section>

                    <section aria-labelledby="plat-h" className="panel">
                        <h2 id="plat-h">Platforms</h2>
                        {game.platforms.length ? (
                            <PlatformTags platforms={game.platforms} />
                        ) : (
                            <p className="muted">IGDB lists no platforms for this game.</p>
                        )}
                    </section>
                </div>
            </div>
            <AddGameDialog
                open={adding}
                onClose={() => setAdding(false)}
                initial={{ game: asResult, platformId: null }}
            />
        </article>
    );
}
