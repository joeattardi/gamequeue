import { ListOrdered } from 'lucide-react';
import { Link } from 'react-router';
import { useQueue } from '../api/queue';
import { UpNextSkeletons } from './HomeSkeletons';
import { GameCard } from './GameCard';

const SHOWN = 4;

/** The first few games on the queue, for the home page. */
export function UpNext() {
    const queue = useQueue(SHOWN);
    // The queue only holds games you own, so every item has its entry
    const entries = queue.items.flatMap((i) => (i.entry ? [i.entry] : []));
    const total = queue.total ?? 0;
    return (
        <section aria-labelledby="upnext-h" className="home-section">
            <div className="page-head">
                <div>
                    <h2 id="upnext-h">
                        <ListOrdered aria-hidden="true" />
                        Up next
                        {total > 0 && (
                            <span className="badge upnext__count">
                                {total}
                                <span className="sr-only"> in your queue</span>
                            </span>
                        )}
                    </h2>
                    {total === 0 && !queue.isPending && (
                        <p className="muted">Nothing queued yet.</p>
                    )}
                </div>
                <Link className="btn" to="/queue">
                    {total === 0 ? 'Build your queue' : 'View queue'}
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
