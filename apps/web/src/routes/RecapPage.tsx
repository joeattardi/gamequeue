import { ArrowLeft, Check, Share2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { useProfileRecap, useRecap } from '../api/recap';
import { Footer } from '../components/Footer';
import { RecapSkeleton } from '../components/PageSkeletons';
import { PublicHeader } from '../components/PublicHeader';
import { RecapView } from '../components/RecapView';
import { usePageTitle } from '../lib';

/** Copies the public URL of a year's recap and says so (the page itself is public, see `ProfileRecapPage`). */
function ShareButton({ username, year }: { username: string; year: number }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const url = `${window.location.origin}/u/${username}/recap/${year}`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setState('copied');
        } catch {
            // No clipboard access (e.g. an insecure origin): show the link so it can be copied by hand
            setState('failed');
        }
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState('idle'), 4000);
    };
    return (
        <div className="share">
            <button type="button" className="btn" onClick={copy}>
                {state === 'copied' ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
                Share
            </button>
            <span className="muted share__status" role="status">
                {state === 'copied'
                    ? 'Link copied'
                    : state === 'failed'
                      ? `Copy this link: ${url}`
                      : ''}
            </span>
        </div>
    );
}

export function RecapPage() {
    const me = useMe();
    const { year } = useParams();
    const recap = useRecap(year);
    usePageTitle(recap.data ? `${recap.data.year} Recap` : 'Recap');
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Sparkles aria-hidden="true" />
                        Year in review
                    </h1>
                    <p className="muted">Your games, year by year. Also on your public profile.</p>
                </div>
            </div>
            {recap.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your recap.
                </p>
            ) : recap.isPending ? (
                <RecapSkeleton />
            ) : (
                <RecapView recap={recap.data} basePath="/recap" />
            )}
        </section>
    );
}

/** Public: someone's year in review, no notes (`/u/:username/recap/:year`). */
export function ProfileRecapPage() {
    const { username = '', year } = useParams();
    const recap = useProfileRecap(username, year);
    usePageTitle(`${username}'s ${recap.data?.year ?? ''} Recap`.replace('  ', ' '));
    const notFound = recap.error instanceof ApiRequestError && recap.error.status === 404;
    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                <h1>{username}: year in review</h1>
                {notFound ? (
                    <p role="alert">There is nothing here.</p>
                ) : recap.isError ? (
                    <p role="alert">Couldn't load.</p>
                ) : recap.isPending ? (
                    <RecapSkeleton />
                ) : (
                    <RecapView recap={recap.data} basePath={`/u/${username}/recap`} />
                )}
            </main>
            <Footer />
        </>
    );
}
