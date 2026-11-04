import { Link } from 'react-router';
import { PlayingSkeletons } from '../components/HomeSkeletons';
import { PlayingCard } from '../components/PlayingCard';
import { ReleasingSoon } from '../components/ReleasingSoon';
import { UpNext } from '../components/UpNext';
import { useEntries } from '../api/collection';
import { useStats } from '../api/stats';
import { useWishlistCount } from '../api/wishlist';
import { Welcome } from '../components/Welcome';
import { LogoMark } from '../components/Logo';
import { Dices, Gamepad2, Pause } from 'lucide-react';
import { useFirstName } from '../api/auth';
import { greeting, usePageTitle } from '../lib';
import { MAX_PAGE_SIZE } from '@gamequeue/shared';

const PLAYING = new URLSearchParams({ status: 'playing', sort: 'added', dir: 'desc' });
const PAUSED = new URLSearchParams({ status: 'paused', sort: 'added', dir: 'desc' });

export function Home() {
    usePageTitle('Now playing');
    const playing = useEntries(PLAYING, MAX_PAGE_SIZE);
    const paused = useEntries(PAUSED, MAX_PAGE_SIZE);
    const firstName = useFirstName();
    const stats = useStats();
    const wishlisted = useWishlistCount();

    // Nothing owned (so nothing queued or listed either) and nothing wishlisted
    if (stats.data?.overview.total === 0 && wishlisted.data === 0) return <Welcome />;

    const overview = stats.data?.overview;
    const summary = overview
        ? `${overview.byStatus.playing} playing · ${overview.byStatus.paused} paused · ${overview.backlogCount} in the backlog`
        : ' ';
    const playingNow = playing.data?.entries ?? [];
    const pausedNow = paused.data?.entries ?? [];

    return (
        <div className="home">
            <header className="home-hero">
                <span className="home-hero__icon" aria-hidden="true">
                    <LogoMark />
                </span>
                <h1>{greeting(firstName)}</h1>
                <p className="home-hero__sub">{summary}</p>
            </header>
            <section aria-labelledby="playing-h" className="home-section home-section--first">
                <div className="page-head">
                    <div>
                        <h2 id="playing-h">
                            <Gamepad2 aria-hidden="true" />
                            Playing
                        </h2>
                        <p className="muted">Every game you have in progress.</p>
                    </div>
                    <Link className="btn" to="/pick">
                        <Dices />
                        Random pick
                    </Link>
                </div>
                {playing.isError ? (
                    <p className="form-error" role="alert">
                        Couldn't load what you are playing.
                    </p>
                ) : playing.isPending ? (
                    <PlayingSkeletons />
                ) : playingNow.length === 0 ? (
                    <p className="muted">
                        Nothing in play right now. Start a game from your{' '}
                        <Link to="/queue">queue</Link>, your <Link to="/backlog">backlog</Link> or a{' '}
                        <Link to="/pick">random pick</Link>.
                    </p>
                ) : (
                    <ul className="play-grid" aria-busy={playing.isFetching}>
                        {playingNow.map((e) => (
                            <PlayingCard key={e.id} entry={e} />
                        ))}
                    </ul>
                )}
            </section>
            {pausedNow.length > 0 && (
                <section aria-labelledby="paused-h" className="home-section">
                    <div className="page-head">
                        <h2 id="paused-h">
                            <Pause aria-hidden="true" />
                            Paused
                        </h2>
                    </div>
                    <ul className="play-grid play-grid--compact" aria-busy={paused.isFetching}>
                        {pausedNow.map((e) => (
                            <PlayingCard key={e.id} entry={e} compact />
                        ))}
                    </ul>
                </section>
            )}
            <UpNext />
            <ReleasingSoon />
        </div>
    );
}
