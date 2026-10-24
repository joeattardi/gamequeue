import { ArrowLeft, ExternalLink, Heart } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileGame } from '../api/profile';
import { Cover } from '../components/Cover';
import { EntrySkeleton } from '../components/PageSkeletons';
import { PublicNotes } from '../components/NotesPanel';
import { PlatformTags } from '../components/PlatformIcon';
import { PublicHeader } from '../components/PublicHeader';
import { ScoreGauge } from '../components/ScoreGauge';
import { Screenshots } from '../components/Screenshots';
import { StarDisplay } from '../components/StarRating';
import { usePageTitle, yearOf } from '../lib';
import { TimeToBeat } from '../components/TimeToBeat';

/**
 * Public: a game as seen from someone's profile (`/u/:username/games/:igdbId`): IGDB's data, and
 * what that person has of it. Everything comes from the cache, so it works without a login.
 */
export function ProfileGamePage() {
    const { username = '', igdbId = '' } = useParams();
    const id = Number(igdbId);
    const valid = Number.isInteger(id) && id > 0;
    const data = useProfileGame(username, valid ? id : 0);
    usePageTitle(data.data ? `${data.data.game.name} · ${username}` : undefined);
    const notFound = !valid || (data.error instanceof ApiRequestError && data.error.status === 404);

    const back = (
        <Link to={`/u/${username}`} className="back">
            <ArrowLeft aria-hidden="true" /> {username}
        </Link>
    );
    return (
        <>
            <PublicHeader />
            <main className="page">
                {data.isPending && !notFound && <EntrySkeleton />}
                {notFound && (
                    <>
                        {back}
                        <p role="alert">There is nothing here.</p>
                    </>
                )}
                {!notFound && data.isError && (
                    <>
                        {back}
                        <p role="alert">Couldn't load.</p>
                    </>
                )}
                {data.data && (
                    <article className="entry">
                        {back}
                        <ProfileGame data={data.data} />
                    </article>
                )}
            </main>
        </>
    );
}

function ProfileGame({ data }: { data: NonNullable<ReturnType<typeof useProfileGame>['data']> }) {
    const { game, entry, wishlisted, username } = data;
    const copy = entry
        ? null
        : wishlisted
          ? `${username} has this on their wishlist.`
          : `${username} hasn't added this game to their collection.`;
    return (
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
                        {game.series.length > 0 && (
                            <p className="muted series-links">
                                Series: {game.series.map((s) => s.name).join(', ')}
                            </p>
                        )}
                    </div>
                    {game.igdbRating !== null && (
                        <ScoreGauge value={game.igdbRating} label="IGDB" />
                    )}
                </header>
                {game.summary && <p className="summary">{game.summary}</p>}

                <section aria-labelledby="pg-copy-h" className="panel stack">
                    <h2 id="pg-copy-h">{username}'s copy</h2>
                    {copy && <p className="muted">{copy}</p>}
                    {entry && (
                        <div className="game-actions">
                            <span className={`badge badge--${entry.status}`}>{entry.status}</span>
                            {entry.rating !== null && <StarDisplay value={entry.rating} />}
                            {entry.favorite && (
                                <span className="badge">
                                    <Heart aria-hidden="true" /> Favorite
                                </span>
                            )}
                        </div>
                    )}
                    {entry && entry.platforms.length > 0 && (
                        <PlatformTags platforms={entry.platforms} />
                    )}
                    {entry && entry.tags.length > 0 && (
                        <ul className="rule-summary" aria-label="Tags">
                            {entry.tags.map((t) => (
                                <li key={t} className="badge">
                                    {t}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <PublicNotes username={username} notes={data.notes} />

                <TimeToBeat ttb={game.ttb} id="pg-ttb-h" />

                <section aria-labelledby="pg-plat-h" className="panel">
                    <h2 id="pg-plat-h">Platforms</h2>
                    {game.platforms.length ? (
                        <PlatformTags platforms={game.platforms} />
                    ) : (
                        <p className="muted">IGDB lists no platforms for this game.</p>
                    )}
                </section>

                {game.slug && (
                    <p>
                        <a
                            href={`https://www.igdb.com/games/${encodeURIComponent(game.slug)}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            View on IGDB <ExternalLink aria-hidden="true" />
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
}
