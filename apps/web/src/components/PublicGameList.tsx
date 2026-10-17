import type { PublicEntryDto } from '@gamequeue/shared';
import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { Cover } from './Cover';
import { StarDisplay } from './StarRating';

type Layout = 'grid' | 'list';
const LAYOUT_KEY = 'gq_public_layout';

function loadLayout(): Layout {
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
    } catch {
        return 'grid';
    }
}

/** The one layout shared by every public profile sub-page (`/u/:username/:view`). */
export function PublicGameList({
    entries,
    numbered = false,
    empty
}: {
    entries: PublicEntryDto[];
    /** Show each game's position, for ordered lists such as the queue */
    numbered?: boolean;
    empty: string;
}) {
    const [layout, setLayout] = useState<Layout>(loadLayout);
    if (entries.length === 0) return <p className="muted">{empty}</p>;

    const choose = (next: Layout) => {
        setLayout(next);
        try {
            localStorage.setItem(LAYOUT_KEY, next);
        } catch {
            // Not persisted (private window, blocked storage); the choice still applies.
        }
    };
    const toggle = (
        <div className="layout-toggle" role="group" aria-label="Layout">
            <button
                type="button"
                aria-pressed={layout === 'grid'}
                aria-label="Grid"
                title="Grid"
                onClick={() => choose('grid')}
            >
                <LayoutGrid aria-hidden="true" />
            </button>
            <button
                type="button"
                aria-pressed={layout === 'list'}
                aria-label="List"
                title="List"
                onClick={() => choose('list')}
            >
                <List aria-hidden="true" />
            </button>
        </div>
    );

    if (layout === 'grid')
        return (
            <>
                {toggle}
                <ol className="public-grid">
                    {entries.map((e, i) => (
                        <li key={e.id} tabIndex={0}>
                            <Cover imageId={e.game.coverImageId} name={e.game.name} />
                            <div className="public-grid__info">
                                <strong>{e.game.name}</strong>
                                <div>
                                    <span className={`badge badge--${e.status}`}>{e.status}</span>
                                    {e.rating !== null && <StarDisplay value={e.rating} />}
                                </div>
                            </div>
                            {numbered && <span className="public-grid__pos">{i + 1}</span>}
                        </li>
                    ))}
                </ol>
            </>
        );
    return (
        <>
            {toggle}
            <ol className="public-games">
                {entries.map((e, i) => (
                    <li key={e.id}>
                        {numbered && <span className="public-games__pos">{i + 1}</span>}
                        <Cover imageId={e.game.coverImageId} name={e.game.name} />
                        <div>
                            <strong>{e.game.name}</strong>
                            <div>
                                <span className={`badge badge--${e.status}`}>{e.status}</span>
                                {e.rating !== null && <StarDisplay value={e.rating} />}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </>
    );
}

/** Placeholder shown while a list loads, in whichever layout the visitor last chose. */
export function PublicGameListSkeleton({ count = 12 }: { count?: number }) {
    const [layout] = useState<Layout>(loadLayout);
    const items = Array.from({ length: count }, (_, i) => i);
    return (
        <div role="status" aria-label="Loading games">
            <div className="layout-toggle" aria-hidden="true">
                <span className="skeleton skeleton--toggle" />
            </div>
            {layout === 'grid' ? (
                <ul className="public-grid" aria-hidden="true">
                    {items.map((i) => (
                        <li key={i}>
                            <div className="skeleton skeleton--cover" />
                        </li>
                    ))}
                </ul>
            ) : (
                <ul className="public-games" aria-hidden="true">
                    {items.slice(0, 8).map((i) => (
                        <li key={i}>
                            <div className="skeleton skeleton--thumb" />
                            <div className="skeleton-lines">
                                <span
                                    className="skeleton skeleton--line"
                                    style={{ width: `${55 + ((i * 17) % 35)}%` }}
                                />
                                <span className="skeleton skeleton--line skeleton--short" />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
