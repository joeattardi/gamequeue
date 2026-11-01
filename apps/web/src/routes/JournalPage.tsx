import type { JournalDto, JournalPostDto } from '@gamequeue/shared';
import { ArrowLeft, Clock, EyeOff, Flag, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useJournal } from '../api/journal';
import { Cover } from '../components/Cover';
import { Lightbox } from '../components/ImageLightbox';
import { JournalSkeletons } from '../components/PageSkeletons';
import { PlatformTags } from '../components/PlatformIcon';
import { PublicHeader } from '../components/PublicHeader';
import { StarDisplay } from '../components/StarRating';
import { formatDate, formatMinutes, usePageTitle } from '../lib';

/**
 * Public: one playthrough's journal (`/p/:slug`), readable by anyone with the link while the owner
 * keeps it unlisted or public. Works without a login; the server sends it `noindex`.
 */
export function JournalPage() {
    const { slug = '' } = useParams();
    const journal = useJournal(slug);
    usePageTitle(journal.data ? `${journal.data.game.name} journal` : undefined);
    const notFound = journal.error instanceof ApiRequestError && journal.error.status === 404;
    return (
        <>
            <PublicHeader />
            <main className="page">
                {journal.isPending && <JournalPageSkeleton />}
                {notFound && (
                    <p role="alert">
                        There is nothing here. The journal may have been made private or removed.
                    </p>
                )}
                {!notFound && journal.isError && <p role="alert">Couldn't load this journal.</p>}
                {journal.data && <JournalView journal={journal.data} />}
            </main>
        </>
    );
}

function JournalPageSkeleton() {
    return (
        <div className="journal-page" role="status" aria-label="Loading journal">
            <div className="journal-page__head" aria-hidden="true">
                <span className="skeleton journal-page__cover" />
                <div className="stack">
                    <span
                        className="skeleton skeleton--line"
                        style={{ width: '60%', height: 28 }}
                    />
                    <span className="skeleton skeleton--line" style={{ width: '40%' }} />
                </div>
            </div>
            <JournalSkeletons />
        </div>
    );
}

function JournalView({ journal }: { journal: JournalDto }) {
    const { game, owner, platform } = journal;
    return (
        <article className="journal-page">
            <Link to={`/u/${owner.username}`} className="back">
                <ArrowLeft aria-hidden="true" /> {owner.username}
            </Link>
            <header className="journal-page__head">
                <div className="journal-page__cover">
                    <Cover imageId={game.coverImageId} name={game.name} size="720p" />
                </div>
                <div className="stack">
                    <p className="muted">A playthrough journal by {owner.username}</p>
                    <h1>{game.name}</h1>
                    <div className="game-actions">
                        {journal.outcome ? (
                            <span className={`badge badge--${journal.outcome}`}>
                                {journal.outcome}
                            </span>
                        ) : (
                            <span className="badge badge--playing">in progress</span>
                        )}
                        {platform && <PlatformTags platforms={[{ id: 0, ...platform }]} />}
                        {journal.rating !== null && <StarDisplay value={journal.rating} />}
                        {journal.playtimeMinutes !== null && (
                            <span className="muted">
                                {formatMinutes(journal.playtimeMinutes)} played
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <ol className="journal-timeline">
                {journal.startedOn && (
                    <li className="journal-marker">
                        <Play aria-hidden="true" />
                        <span>Started {formatDate(journal.startedOn)}</span>
                    </li>
                )}
                {journal.posts.map((post) => (
                    <PublicPost key={post.id} post={post} slug={journal.slug} />
                ))}
                {journal.posts.length === 0 && (
                    <li className="muted">No posts in this journal yet.</li>
                )}
                {journal.outcome && (
                    <li className="journal-marker journal-marker--end">
                        <Flag aria-hidden="true" />
                        <span>
                            {journal.outcome === 'finished' ? 'Finished' : 'Abandoned'}
                            {journal.endedOn && ` ${formatDate(journal.endedOn)}`}
                        </span>
                        {journal.finalThoughts && (
                            <p className="journal__body">{journal.finalThoughts}</p>
                        )}
                    </li>
                )}
            </ol>
        </article>
    );
}

const imageUrl = (slug: string, id: number) => `/api/journals/${slug}/images/${id}`;

/** A post. A spoiler is collapsed, text and pictures alike, until the visitor asks for it. */
function PublicPost({ post, slug }: { post: JournalPostDto; slug: string }) {
    const [revealed, setRevealed] = useState(!post.spoiler);
    const [lightbox, setLightbox] = useState<number | null>(null);
    const when = new Date(post.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
    return (
        <li className="journal__post">
            <div className="journal__meta">
                <time className="muted" dateTime={new Date(post.createdAt).toISOString()}>
                    {when}
                </time>
            </div>
            {!revealed ? (
                <button
                    type="button"
                    className="btn journal__spoiler"
                    onClick={() => setRevealed(true)}
                >
                    <EyeOff aria-hidden="true" /> Spoiler: click to show
                </button>
            ) : (
                <>
                    {post.kind === 'hours' && post.minutes !== null && (
                        <p className="journal__hours">
                            <Clock aria-hidden="true" /> {formatMinutes(post.minutes)} played
                        </p>
                    )}
                    {post.body && <p className="journal__body">{post.body}</p>}
                    {post.images.length > 0 && (
                        <ul className="journal__images" aria-label="Screenshots">
                            {post.images.map((img, i) => (
                                <li key={img.id}>
                                    <button
                                        type="button"
                                        className="journal__thumb"
                                        onClick={() => setLightbox(i)}
                                        aria-label={`View picture ${i + 1} of ${post.images.length}`}
                                    >
                                        <img
                                            src={imageUrl(slug, img.id)}
                                            width={img.width}
                                            height={img.height}
                                            alt=""
                                            loading="lazy"
                                        />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Lightbox
                        urls={post.images.map((img) => imageUrl(slug, img.id))}
                        label="Journal pictures"
                        alt={(i) => `Picture ${i + 1} of ${post.images.length}`}
                        index={lightbox}
                        onIndex={setLightbox}
                        onClose={() => setLightbox(null)}
                    />
                </>
            )}
        </li>
    );
}
