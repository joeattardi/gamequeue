import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileQueue } from '../api/profile';
import { Cover } from '../components/Cover';
import { PublicHeader } from './ProfilePage';

/** Public: a read-only view of someone's queue, next game first. */
export function ProfileQueuePage() {
    const { username = '' } = useParams();
    const queue = useProfileQueue(username);
    const notFound = queue.error instanceof ApiRequestError && queue.error.status === 404;

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {queue.isPending && <p role="status">Loading…</p>}
                {queue.isError && (
                    <p role="alert">
                        {notFound ? `There is no user called "${username}".` : "Couldn't load."}
                    </p>
                )}
                {queue.data && (
                    <>
                        <h1>{queue.data.username}'s queue</h1>
                        {queue.data.entries.length === 0 ? (
                            <p className="muted">Nothing queued up.</p>
                        ) : (
                            <ol className="public-queue">
                                {queue.data.entries.map((e, i) => (
                                    <li key={e.id}>
                                        <span className="public-queue__pos">{i + 1}</span>
                                        <Cover imageId={e.game.coverImageId} name={e.game.name} />
                                        <div>
                                            <strong>{e.game.name}</strong>
                                            <div>
                                                <span className={`badge badge--${e.status}`}>
                                                    {e.status}
                                                </span>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </>
                )}
            </main>
        </>
    );
}
