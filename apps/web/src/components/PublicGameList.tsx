import type { PublicEntryDto } from '@gamequeue/shared';
import { LayoutGrid, List } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
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

/** Fade-in delay for the item at `index`; capped so long lists don't take long to appear. */
function staggerStyle(index: number): CSSProperties {
    return { '--i': Math.min(index, 14) } as CSSProperties;
}

/** The one layout shared by every public profile sub-page (`/u/:username/:view`). */
export function PublicGameList({
    entries,
    numbered = false,
    empty
}: {
    /** Undefined while loading: the selector stays, the list shows skeletons */
    entries: PublicEntryDto[] | undefined;
    /** Show each game's position, for ordered lists such as the queue */
    numbered?: boolean;
    empty: string;
}) {
    const [layout, setLayout] = useState<Layout>(loadLayout);

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

    let content;
    if (!entries) content = <Skeleton layout={layout} numbered={numbered} />;
    else if (entries.length === 0) content = <p className="muted">{empty}</p>;
    else if (layout === 'grid')
        content = (
            <ol className="public-grid">
                {entries.map((e, i) => (
                    <li key={e.id} tabIndex={0} style={staggerStyle(i)}>
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
        );
    else
        content = (
            <ol className="public-games">
                {entries.map((e, i) => (
                    <li key={e.id} style={staggerStyle(i)}>
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
        );
    return (
        <>
            {toggle}
            {content}
        </>
    );
}

/** Loading placeholders built on the real list's own classes, so sizes match. */
function Skeleton({ layout, numbered }: { layout: Layout; numbered: boolean }) {
    return (
        <>
            {layout === 'grid' ? (
                <ul className="public-grid" role="status" aria-label="Loading games">
                    {Array.from({ length: 12 }, (_, i) => (
                        <li key={i}>
                            <div className="public-skeleton public-skeleton--cover" />
                        </li>
                    ))}
                </ul>
            ) : (
                <ul className="public-games" role="status" aria-label="Loading games">
                    {Array.from({ length: 8 }, (_, i) => (
                        <li key={i}>
                            {numbered && <span className="public-games__pos">&nbsp;</span>}
                            <div className="public-skeleton public-skeleton--thumb" />
                            <div className="public-skeleton-lines">
                                <span
                                    className="public-skeleton public-skeleton--line"
                                    style={{ width: `${140 + ((i * 37) % 90)}px` }}
                                />
                                <span className="public-skeleton public-skeleton--short" />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
