import { PROFILE_VIEWS, type ProfileView } from '@gamequeue/shared';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileGames } from '../api/profile';
import { PublicGameList } from '../components/PublicGameList';
import { PublicHeader } from '../components/PublicHeader';

const VIEWS: Record<ProfileView, { title: string; empty: string; numbered?: boolean }> = {
    queue: { title: 'Queue', empty: 'Nothing queued up.', numbered: true },
    collection: { title: 'Collection', empty: 'No games yet.' },
    backlog: { title: 'Backlog', empty: 'The backlog is empty.' },
    playing: { title: 'Playing', empty: 'Not playing anything right now.' },
    paused: { title: 'Paused', empty: 'Nothing is paused.' },
    finished: { title: 'Finished', empty: 'No finished games yet.' },
    abandoned: { title: 'Abandoned', empty: 'No abandoned games.' }
};

/** Public: a read-only list of someone's games for one profile counter, e.g. `/u/joe/finished`. */
export function ProfileGamesPage() {
    const { username = '', view = '' } = useParams();
    const known = PROFILE_VIEWS.includes(view as ProfileView);
    // The query only runs for a known view; an unknown one is a plain not-found page.
    const games = useProfileGames(username, known ? (view as ProfileView) : 'queue', known);
    const notFound =
        !known || (games.error instanceof ApiRequestError && games.error.status === 404);
    const meta = known ? VIEWS[view as ProfileView] : undefined;

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {notFound && <p role="alert">There is nothing here.</p>}
                {!notFound && games.isError && <p role="alert">Couldn't load.</p>}
                {!notFound && !games.isError && meta && (
                    <>
                        <h1>
                            {games.data?.username ?? username}: {meta.title.toLowerCase()}
                        </h1>
                        <PublicGameList
                            entries={games.data?.entries}
                            numbered={meta.numbered}
                            empty={meta.empty}
                        />
                    </>
                )}
            </main>
        </>
    );
}
