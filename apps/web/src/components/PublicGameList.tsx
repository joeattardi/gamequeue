import type { EntryStatus, GameDto } from '@gamequeue/shared';
import type { CSSProperties } from 'react';
import { Cover } from './Cover';
import { LayoutToggle, useLayout, type Layout } from './LayoutToggle';
import { LoadMore } from './LoadMore';
import { StarDisplay } from './StarRating';

type LoadMoreProps = Parameters<typeof LoadMore>[0];

/** What this list shows of a game; a `PublicEntryDto` fits, and so does a wishlist item. */
export interface PublicListItem {
    id: number;
    game: GameDto;
    status?: EntryStatus;
    rating?: number | null;
    /** A short line under the title, e.g. the platform a wishlisted game is wanted on */
    caption?: string;
}

const LAYOUT_KEY = 'gq_public_layout';

/** Fade-in delay for the item at `index`; capped so long lists don't take long to appear. */
function staggerStyle(index: number): CSSProperties {
    return { '--i': Math.min(index, 14) } as CSSProperties;
}

/** The one layout shared by every public profile sub-page (`/u/:username/:view`). */
export function PublicGameList({
    entries,
    numbered = false,
    empty,
    paging
}: {
    /** Undefined while loading: the selector stays, the list shows skeletons */
    entries: PublicListItem[] | undefined;
    /** Show each game's position, for ordered lists such as the queue */
    numbered?: boolean;
    empty: string;
    /** Footer for a paged list; omit when `entries` is complete */
    paging?: Omit<LoadMoreProps, 'skeleton' | 'shown'>;
}) {
    const [layout, setLayout] = useLayout(LAYOUT_KEY);

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
                            <Details item={e} />
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
                            <Details item={e} />
                        </div>
                    </li>
                ))}
            </ol>
        );
    return (
        <>
            <LayoutToggle layout={layout} onChange={setLayout} />
            {content}
            {paging && entries && (
                <LoadMore
                    {...paging}
                    shown={entries.length}
                    skeleton={<Skeleton layout={layout} numbered={numbered} count={4} />}
                />
            )}
        </>
    );
}

function Details({ item }: { item: PublicListItem }) {
    return (
        <div>
            {item.status && <span className={`badge badge--${item.status}`}>{item.status}</span>}
            {item.rating != null && <StarDisplay value={item.rating} />}
            {item.caption && <span className="muted">{item.caption}</span>}
        </div>
    );
}

/** Loading placeholders built on the real list's own classes, so sizes match. */
function Skeleton({
    layout,
    numbered,
    count
}: {
    layout: Layout;
    numbered: boolean;
    count?: number;
}) {
    return (
        <>
            {layout === 'grid' ? (
                <ul className="public-grid" role="status" aria-label="Loading games">
                    {Array.from({ length: count ?? 12 }, (_, i) => (
                        <li key={i}>
                            <div className="public-skeleton public-skeleton--cover" />
                        </li>
                    ))}
                </ul>
            ) : (
                <ul className="public-games" role="status" aria-label="Loading games">
                    {Array.from({ length: count ?? 8 }, (_, i) => (
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
