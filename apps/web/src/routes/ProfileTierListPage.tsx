import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { usePublicTierList } from '../api/tiers';
import { DownloadTierImage } from '../components/DownloadTierImage';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { TierBoard, TierBoardSkeleton } from '../components/TierBoard';
import { usePageTitle } from '../lib';

/** Public: someone's tier list (`/u/:username/tiers/:id`). Needs no login. */
export function ProfileTierListPage() {
    const { username = '', id = '' } = useParams();
    const list = usePublicTierList(username, Number(id));
    usePageTitle(list.data ? `${list.data.title} by ${username}` : 'Tier list');
    // Visitors only see tiers that have games, on the page and in the downloaded image
    const shown = list.data && {
        ...list.data,
        tiers: list.data.tiers.filter((t) => t.items.length > 0)
    };
    const notFound = list.error instanceof ApiRequestError && list.error.status === 404;

    return (
        <>
            <PublicHeader />
            <main className="page tier-page">
                <Link to={`/u/${username}`} className="back-link">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {list.isError && (
                    <p role="alert">{notFound ? 'There is nothing here.' : "Couldn't load."}</p>
                )}
                {list.isPending && <TierBoardSkeleton />}
                {list.data && shown && (
                    <>
                        <h1>{list.data.title}</h1>
                        <p className="muted">
                            by <Link to={`/u/${username}`}>{username}</Link>
                        </p>
                        {list.data.description && <p>{list.data.description}</p>}
                        {shown.tiers.length === 0 ? (
                            <p className="muted">Nothing has been ranked yet.</p>
                        ) : (
                            <>
                                <TierBoard list={shown} />
                                <DownloadTierImage list={shown} username={username} />
                            </>
                        )}
                    </>
                )}
            </main>
            <Footer />
        </>
    );
}
