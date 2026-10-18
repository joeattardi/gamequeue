import { Link } from 'react-router';
import { useQueue } from '../api/queue';
import { formatMinutes } from '../lib';
import { UpNextSkeletons } from './HomeSkeletons';
import { Cover } from './Cover';

const SHOWN = 4;

/** The first few games on the queue, for the home page. */
export function UpNext() {
    const queue = useQueue();
    const entries = queue.data?.entries ?? [];
    return (
        <section aria-labelledby="upnext-h" className="upnext">
            <div className="page-head">
                <div>
                    <h2 id="upnext-h">Up next</h2>
                    <p className="muted">
                        {queue.isPending
                            ? 'Checking your queue…'
                            : entries.length === 0
                              ? 'Nothing queued yet.'
                              : `${entries.length} in your queue`}
                    </p>
                </div>
                <Link className="btn" to="/queue">
                    {entries.length === 0 ? 'Build your queue' : 'View queue'}
                </Link>
            </div>
            {queue.isPending && <UpNextSkeletons />}
            {entries.length > 0 && (
                <ol className="upnext__list">
                    {entries.slice(0, SHOWN).map((e, i) => (
                        <li key={e.id}>
                            <Link to={`/games/${e.id}`} className="upnext__item">
                                <Cover
                                    imageId={e.game.coverImageId}
                                    name={e.game.name}
                                    size="cover_big"
                                />
                                <span className="upnext__text">
                                    <span className="muted">{i + 1}</span>
                                    <strong>{e.game.name}</strong>
                                    {e.ttbMinutes !== null && (
                                        <span className="muted">{formatMinutes(e.ttbMinutes)}</span>
                                    )}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
