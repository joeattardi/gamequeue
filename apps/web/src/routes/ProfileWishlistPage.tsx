import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileWishlist } from '../api/profile';
import { PublicGameList } from '../components/PublicGameList';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { platformLabel, releaseText, usePageTitle } from '../lib';

/** Public: someone's wishlist in their order, without their notes (`/u/:username/wishlist`). */
export function ProfileWishlistPage() {
    const { username = '' } = useParams();
    const wishlist = useProfileWishlist(username);
    usePageTitle(`${wishlist.data?.username ?? username}'s Wishlist`);
    const notFound = wishlist.error instanceof ApiRequestError && wishlist.error.status === 404;

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {notFound && <p role="alert">There is nothing here.</p>}
                {!notFound && wishlist.isError && <p role="alert">Couldn't load.</p>}
                {!notFound && !wishlist.isError && (
                    <>
                        <h1>{wishlist.data?.username ?? username}: wishlist</h1>
                        <PublicGameList
                            entries={wishlist.data?.items.map((i) => ({
                                id: i.igdbId,
                                game: i.game,
                                caption: [
                                    releaseText(i.game),
                                    i.platform && platformLabel(i.platform)
                                ]
                                    .filter(Boolean)
                                    .join(' · ')
                            }))}
                            numbered
                            empty="Nothing on the wishlist."
                        />
                    </>
                )}
            </main>
        </>
    );
}
