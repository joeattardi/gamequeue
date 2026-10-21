import type { SeriesDto, SeriesMemberDto } from '@gamequeue/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useQueueSeries, useSeries } from '../api/series';
import { useAddToWishlist } from '../api/wishlist';
import { Cover } from '../components/Cover';
import { SeriesSkeleton } from '../components/PageSkeletons';
import { releaseText, usePageTitle } from '../lib';
import { ArrowLeft, Gift, Layers, ListPlus } from 'lucide-react';

/** One IGDB series: its games in release order, marked with what you have of each. */
export function SeriesPage() {
    const id = Number(useParams().id);
    const series = useSeries(id);
    usePageTitle(series.data?.name);
    if (series.isPending) return <SeriesSkeleton />;
    if (series.isError || !series.data)
        return (
            <div className="empty">
                <p>
                    <strong>
                        {series.error instanceof ApiRequestError
                            ? series.error.message
                            : "Couldn't load that series."}
                    </strong>
                </p>
                <Link to="/collection">Back to collection</Link>
            </div>
        );
    return <SeriesView series={series.data} />;
}

function SeriesView({ series }: { series: SeriesDto }) {
    const queue = useQueueSeries(series.id);
    const [added, setAdded] = useState<number>();
    const [error, setError] = useState<string>();
    const owned = series.members.filter((m) => m.entry).length;
    const wished = series.members.filter((m) => !m.entry && m.wishlisted).length;
    const queueable = series.members.filter(
        (m) => m.entry?.status === 'unplayed' && !m.entry.queued
    ).length;

    return (
        <section>
            <Link to="/collection" className="back">
                <ArrowLeft /> Collection
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Layers aria-hidden="true" />
                        {series.name}
                    </h1>
                    <p className="muted">
                        You own {owned} of {series.members.length}
                        {wished > 0 && ` · ${wished} on your wishlist`}
                    </p>
                </div>
                <div className="row">
                    <button
                        className="btn btn--primary"
                        disabled={queueable === 0 || queue.isPending}
                        onClick={() => {
                            setError(undefined);
                            queue.mutate(undefined, {
                                onSuccess: (r) => setAdded(r.added),
                                onError: () => setError("Couldn't update your queue.")
                            });
                        }}
                    >
                        <ListPlus />
                        Queue my unplayed games{queueable > 0 && ` (${queueable})`}
                    </button>
                </div>
            </div>
            <p aria-live="polite" className="muted">
                {added !== undefined && (
                    <>
                        Added {added} {added === 1 ? 'game' : 'games'} to your{' '}
                        <Link to="/queue">queue</Link>, in release order.
                    </>
                )}
            </p>
            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}
            {series.members.length === 0 ? (
                <p className="empty">IGDB lists no games for this series.</p>
            ) : (
                <ul className="game-rows">
                    {series.members.map((m) => (
                        <SeriesRow key={m.igdbId} member={m} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function SeriesRow({ member: m }: { member: SeriesMemberDto }) {
    const addWish = useAddToWishlist();
    const [error, setError] = useState(false);
    // Games you don't own have no page of their own: the IGDB page is where they get added
    const to = m.entry ? `/games/${m.entry.id}` : `/games/igdb/${m.igdbId}`;
    return (
        <li>
            <div className={`game-row series-row${m.entry ? '' : ' series-row--missing'}`}>
                <Link to={to} className="series-row__main">
                    <Cover imageId={m.coverImageId} name={m.name} size="cover_small" />
                    <span className="game-row__text">
                        <strong className="card__title">{m.name}</strong>
                        <span className="muted card__sub">
                            {releaseText({
                                releaseDate: m.releaseDate,
                                releasePrecision: m.releasePrecision
                            })}
                        </span>
                    </span>
                </Link>
                <span className="card__chips">
                    {m.entry ? (
                        <>
                            <span
                                className={`badge${m.entry.status === 'unplayed' ? ' badge--quiet' : ` badge--${m.entry.status}`}`}
                            >
                                {m.entry.status}
                            </span>
                            {m.entry.queued && <span className="badge">queued</span>}
                        </>
                    ) : m.wishlisted ? (
                        <span className="badge">On wishlist</span>
                    ) : (
                        <button
                            className="btn btn--small"
                            disabled={addWish.isPending}
                            aria-label={`Add ${m.name} to wishlist`}
                            onClick={() => {
                                setError(false);
                                addWish.mutate(
                                    { igdbId: m.igdbId },
                                    { onError: () => setError(true) }
                                );
                            }}
                        >
                            <Gift />
                            Wishlist
                        </button>
                    )}
                    {error && (
                        <span className="form-error" role="alert">
                            Couldn't add it.
                        </span>
                    )}
                </span>
            </div>
        </li>
    );
}
