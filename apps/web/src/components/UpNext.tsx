import { ListOrdered } from 'lucide-react';
import { Link } from 'react-router';
import { useQueue } from '../api/queue';
import { UpNextSkeletons } from './HomeSkeletons';
import { GameCard } from './GameCard';

const SHOWN = 4;

/** The first few games on the queue, for the home page. */
export function UpNext() {
    const queue = useQueue();
    const entries = queue.data?.entries ?? [];
    return (
        <section aria-labelledby="upnext-h" className="upnext">
            <div className="page-head">
                <div>
                    <h2 id="upnext-h">
                        Up next
                        {entries.length > 0 && (
                            <span className="badge upnext__count">
                                {entries.length}
                                <span className="sr-only"> in your queue</span>
                            </span>
                        )}
                    </h2>
                    {entries.length === 0 && !queue.isPending && (
                        <p className="muted">Nothing queued yet.</p>
                    )}
                </div>
                <Link className="btn" to="/queue">
                    <ListOrdered aria-hidden="true" />
                    {entries.length === 0 ? 'Build your queue' : 'View queue'}
                </Link>
            </div>
            {queue.isPending && <UpNextSkeletons />}
            {entries.length > 0 && (
                <ol className="grid upnext__list">
                    {entries.slice(0, SHOWN).map((e, i) => (
                        <GameCard key={e.id} entry={e} position={i + 1} />
                    ))}
                </ol>
            )}
        </section>
    );
}
