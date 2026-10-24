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
                {list.data && (
                    <>
                        <h1>{list.data.title}</h1>
                        <p className="muted">
                            by <Link to={`/u/${username}`}>{username}</Link>
                        </p>
                        {list.data.description && <p>{list.data.description}</p>}
                        <TierBoard list={list.data} />
                        <DownloadTierImage list={list.data} username={username} />
                    </>
                )}
            </main>
            <Footer />
        </>
    );
}
