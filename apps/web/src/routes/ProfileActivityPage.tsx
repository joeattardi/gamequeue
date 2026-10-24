import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileActivity } from '../api/profile';
import { ActivityList, ActivitySkeletons } from '../components/ActivityFeed';
import { LoadMore } from '../components/LoadMore';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

/** Public: everything someone has done lately, newest first (`/u/:username/activity`). */
export function ProfileActivityPage() {
    const { username = '' } = useParams();
    const activity = useProfileActivity(username);
    const name = activity.head?.username ?? username;
    usePageTitle(`${name}'s Activity`);
    const notFound = activity.error instanceof ApiRequestError && activity.error.status === 404;

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {notFound && <p role="alert">There is nothing here.</p>}
                {!notFound && activity.isError && <p role="alert">Couldn't load.</p>}
                {!notFound && !activity.isError && (
                    <>
                        <h1>{name}: activity</h1>
                        {activity.isPending && <ActivitySkeletons />}
                        {!activity.isPending && activity.items.length === 0 && (
                            <p className="muted">Nothing to show yet.</p>
                        )}
                        {activity.items.length > 0 && (
                            <ActivityList username={username} events={activity.items} />
                        )}
                        <LoadMore
                            shown={activity.items.length}
                            total={activity.total}
                            hasMore={!!activity.hasNextPage}
                            loading={activity.isFetchingNextPage}
                            failed={activity.isFetchNextPageError}
                            onMore={() => activity.fetchNextPage()}
                            skeleton={<ActivitySkeletons count={3} />}
                        />
                    </>
                )}
            </main>
        </>
    );
}
