import { ChartColumn, ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileStats, useStats } from '../api/stats';
import { Footer } from '../components/Footer';
import { StatsSkeleton } from '../components/PageSkeletons';
import { PublicHeader } from '../components/PublicHeader';
import { StatsView } from '../components/StatsView';
import { usePageTitle } from '../lib';

export function StatsPage() {
    usePageTitle('Stats');
    const stats = useStats();
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <ChartColumn aria-hidden="true" />
                        Stats
                    </h1>
                    <p className="muted">
                        Your collection in numbers. Also on your public profile.
                    </p>
                </div>
            </div>
            {stats.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your stats.
                </p>
            ) : stats.isPending ? (
                <StatsSkeleton />
            ) : (
                <StatsView stats={stats.data} />
            )}
        </section>
    );
}

/** Public: someone's stats, no notes (`/u/:username/stats`). */
export function ProfileStatsPage() {
    const { username = '' } = useParams();
    const stats = useProfileStats(username);
    usePageTitle(`${username}'s Stats`);
    const notFound = stats.error instanceof ApiRequestError && stats.error.status === 404;
    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                <h1>{username}: stats</h1>
                {notFound ? (
                    <p role="alert">There is nothing here.</p>
                ) : stats.isError ? (
                    <p role="alert">Couldn't load.</p>
                ) : stats.isPending ? (
                    <StatsSkeleton />
                ) : (
                    <StatsView stats={stats.data} />
                )}
            </main>
            <Footer />
        </>
    );
}
