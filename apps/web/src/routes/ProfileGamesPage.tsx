import {
    FINISHED_UNKNOWN_YEAR,
    isFinishedYear,
    PROFILE_VIEWS,
    type ProfileView
} from '@gamequeue/shared';
import { ArrowLeft } from 'lucide-react';
import { useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileGames } from '../api/profile';
import { PublicGameList } from '../components/PublicGameList';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

const VIEWS: Record<ProfileView, { title: string; empty: string; numbered?: boolean }> = {
    queue: { title: 'Queue', empty: 'Nothing queued up.', numbered: true },
    collection: { title: 'Collection', empty: 'No games yet.' },
    favorites: { title: 'Favorites', empty: 'No favorites yet.' },
    backlog: { title: 'Backlog', empty: 'The backlog is empty.' },
    playing: { title: 'Playing', empty: 'Not playing anything right now.' },
    paused: { title: 'Paused', empty: 'Nothing is paused.' },
    finished: { title: 'Finished', empty: 'No finished games yet.' },
    abandoned: { title: 'Abandoned', empty: 'No abandoned games.' }
};

const yearLabel = (year: string) => (year === FINISHED_UNKNOWN_YEAR ? 'unknown date' : year);

/** Public: a read-only list of someone's games for one profile counter, e.g. `/u/joe/finished`. */
export function ProfileGamesPage() {
    const { username = '', view = '', year } = useParams();
    // Only the finished view has year pages.
    const known =
        PROFILE_VIEWS.includes(view as ProfileView) &&
        (year === undefined || (view === 'finished' && isFinishedYear(year)));
    // The query only runs for a known view; an unknown one is a plain not-found page.
    const games = useProfileGames(username, known ? (view as ProfileView) : 'queue', known, year);
    // Keep the year links while another year loads.
    const lastYears = useRef<NonNullable<typeof games.head>['years']>(undefined);
    if (games.head) lastYears.current = games.head.years;
    const years = games.head?.years ?? lastYears.current;
    const notFound =
        !known || (games.error instanceof ApiRequestError && games.error.status === 404);
    const meta = known ? VIEWS[view as ProfileView] : undefined;
    usePageTitle(
        `${games.head?.username ?? username}'s ${meta?.title ?? 'Games'}${year ? ` in ${yearLabel(year)}` : ''}`
    );

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={year ? `/u/${username}/finished` : `/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {year ? 'All finished' : username}
                </Link>
                {notFound && <p role="alert">There is nothing here.</p>}
                {!notFound && games.isError && <p role="alert">Couldn't load.</p>}
                {!notFound && !games.isError && meta && (
                    <>
                        <h1>
                            {games.head?.username ?? username}: {meta.title.toLowerCase()}
                            {year && ` in ${yearLabel(year)}`}
                        </h1>
                        {view === 'finished' && years && years.length > 0 && (
                            <nav className="year-nav" aria-label="Finished by year">
                                <Link to={`/u/${username}/finished`} aria-current={!year && 'page'}>
                                    All
                                </Link>
                                {years.map((y) => (
                                    <Link
                                        key={y.year}
                                        to={`/u/${username}/finished/${y.year}`}
                                        aria-current={y.year === year && 'page'}
                                    >
                                        {yearLabel(y.year)} <span>{y.count}</span>
                                    </Link>
                                ))}
                            </nav>
                        )}
                        <PublicGameList
                            entries={games.isPending ? undefined : games.items}
                            paging={{
                                total: games.total,
                                hasMore: games.hasNextPage,
                                loading: games.isFetchingNextPage,
                                failed: games.isFetchNextPageError,
                                onMore: () => games.fetchNextPage()
                            }}
                            numbered={meta.numbered}
                            empty={year ? 'No games finished then.' : meta.empty}
                        />
                    </>
                )}
            </main>
        </>
    );
}
