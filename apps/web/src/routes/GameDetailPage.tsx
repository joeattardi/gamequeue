import type { GameDetailDto, SearchResultDto } from '@gamequeue/shared';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useGameDetail } from '../api/collection';
import { useAddToWishlist, useRemoveFromWishlist } from '../api/wishlist';
import { AddGameDialog } from '../components/AddGameDialog';
import { ClampedText } from '../components/ClampedText';
import { GameHero } from '../components/GameHero';
import { StatusChip } from '../components/StatusChip';
import { SimilarGames } from '../components/SimilarGames';
import { Screenshots } from '../components/Screenshots';
import { EntrySkeleton } from '../components/PageSkeletons';
import { PlatformTags } from '../components/PlatformIcon';
import { platformText } from '../collectionModel';
import { usePageTitle } from '../lib';
import { Gift, Library, X } from 'lucide-react';
import { TimeToBeat } from '../components/TimeToBeat';

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
        <article className="game">
            <GameHero
                game={game}
                backTo="/collection"
                backLabel="Collection"
                chip={wishlisted ? <StatusChip status="wishlist" /> : undefined}
                platformsLabel="Available on"
                platforms={platformText(game.platforms)}
            >
                <div className="game-hero__actions">
                    <button
                        type="button"
                        className="btn btn--primary btn--lg"
                        onClick={() => setAdding(true)}
                    >
                        <Library aria-hidden="true" />
                        Add to collection
                    </button>
                    {wishlisted ? (
                        <button
                            type="button"
                            className="btn btn--lg"
                            disabled={removeWish.isPending}
                            onClick={() => {
                                setError(undefined);
                                removeWish.mutate(game.id, { onError: fail });
                            }}
                        >
                            <X aria-hidden="true" />
                            Remove from wishlist
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn--lg"
                            disabled={addWish.isPending}
                            onClick={() => {
                                setError(undefined);
                                addWish.mutate({ igdbId: game.id }, { onError: fail });
                            }}
                        >
                            <Gift aria-hidden="true" />
                            Add to wishlist
                        </button>
                    )}
                </div>
                <p className="muted">
                    {wishlisted ? 'On your wishlist.' : "You don't own this game yet."}
                </p>
                <p className="form-error" role="alert">
                    {error}
                </p>
            </GameHero>
            <div className="game-cols">
                <div className="game-main">
                    {game.summary && (
                        <section aria-labelledby="about-h" className="game-section">
                            <h2 id="about-h">About</h2>
                            <ClampedText text={game.summary} />
                        </section>
                    )}
                    <Screenshots imageIds={game.screenshots} name={game.name} />
                    <TimeToBeat ttb={game.ttb} />
                </div>
                <div className="game-side">
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
            <SimilarGames igdbId={game.id} />
            <AddGameDialog
                open={adding}
                onClose={() => setAdding(false)}
                initial={{ game: asResult, platformId: null }}
            />
        </article>
    );
}
