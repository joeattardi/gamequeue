import { ENTRY_STATUSES } from '@gamequeue/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMe } from '../api/auth';
import { useFacetCounts, usePagedEntries } from '../api/collection';
import { useWishlistCount } from '../api/wishlist';
import { AddGameDialog } from '../components/AddGameDialog';
import { CollectionCard, CollectionRow, WallTile } from '../components/CollectionCards';
import { DensityToggle } from '../components/DensityToggle';
import { FACET_KEYS, FilterBar, type FacetKey } from '../components/FilterBar';
import { GridSkeletons } from '../components/GridSkeletons';
import { LoadMore } from '../components/LoadMore';
import { StatusTabs, StatusTabsSkeleton } from '../components/StatusTabs';
import { useDensity } from '../components/useDensity';
import { WishlistTab } from './WishlistPage';
import {
    DEFAULT_SORT,
    TABS,
    apiParams,
    tabCounts,
    tabFromParams,
    type TabKey
} from '../collectionModel';
import { usePageTitle } from '../lib';
import { statusColorOnCover, statusText } from '../statusColor';

/**
 * The Collection: status tabs with counts, a compact bar of filters, and the games as a Wall, a
 * Grid or a List. Backlog (Not Started) and Wishlist are tabs here, not pages of their own. All of
 * it lives in the address (`?status=&platform=&genre=&tag=&sort=…`), so views can be linked and Back works.
 */
export function CollectionPage() {
    const me = useMe().data!;
    usePageTitle('Collection');
    const [params, setParams] = useSearchParams();
    const [adding, setAdding] = useState(false);
    const { density, choose, wallAvailable } = useDensity(me.id);

    const tab = tabFromParams(params);
    const isWishlist = tab === 'wishlist';
    const query = apiParams(params);
    const entries = usePagedEntries(query, {
        limit: density === 'list' ? 48 : 96,
        enabled: !isWishlist
    });
    const facets = useFacetCounts(query);
    const wishlistCount = useWishlistCount();
    const counts = tabCounts(facets.data?.statuses, wishlistCount.data);

    const edit = (change: (p: URLSearchParams) => void) =>
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                change(n);
                return n;
            },
            { replace: true }
        );
    const selected = (key: FacetKey) => params.getAll(key);
    const toggle = (key: FacetKey, value: string) =>
        edit((n) => {
            const values = n.getAll(key);
            n.delete(key);
            (values.includes(value)
                ? values.filter((v) => v !== value)
                : [...values, value]
            ).forEach((v) => n.append(key, v));
        });
    const filtered = [...FACET_KEYS, 'q'].some((k) => params.get(k));
    const pickTab = (t: TabKey) =>
        edit((n) => {
            n.delete('status');
            if (t !== 'all') n.set('status', t);
        });

    const total = isWishlist ? wishlistCount.data : entries.total;

    return (
        <section className="collection">
            <div className="page-head collection__head">
                <div className="collection__title">
                    <h1>Collection</h1>
                    <span className="collection__count" aria-live="polite">
                        {total !== undefined &&
                            `${total.toLocaleString()} ${total === 1 ? 'game' : 'games'}${filtered && !isWishlist ? ' match' : ''}`}
                    </span>
                </div>
                <div className="page-head__tools">
                    {!isWishlist && (
                        <DensityToggle
                            density={density}
                            onChange={choose}
                            wallAvailable={wallAvailable}
                        />
                    )}
                    <button className="btn btn--primary" onClick={() => setAdding(true)}>
                        <Plus aria-hidden="true" />
                        Add game
                    </button>
                </div>
            </div>

            {facets.isPending && !facets.data ? (
                <StatusTabsSkeleton />
            ) : (
                <StatusTabs active={tab} counts={counts} onPick={pickTab} />
            )}

            {isWishlist ? (
                <WishlistTab />
            ) : (
                <>
                    <FilterBar
                        facets={facets.data}
                        selected={selected}
                        onToggle={toggle}
                        onClear={(k) => edit((n) => n.delete(k))}
                        onClearAll={() =>
                            edit((n) => {
                                FACET_KEYS.forEach((k) => n.delete(k));
                                n.delete('q');
                            })
                        }
                        favorite={params.get('favorite') === 'true'}
                        onFavorite={() =>
                            edit((n) =>
                                n.get('favorite') === 'true'
                                    ? n.delete('favorite')
                                    : n.set('favorite', 'true')
                            )
                        }
                        sort={params.get('sort') ?? DEFAULT_SORT}
                        onSort={(v) =>
                            edit((n) => (v === DEFAULT_SORT ? n.delete('sort') : n.set('sort', v)))
                        }
                    />
                    {density === 'wall' && <WallLegend />}
                    {entries.isError ? (
                        <p className="form-error" role="alert">
                            Couldn't load your games.
                        </p>
                    ) : entries.isPending ? (
                        <GridSkeletons layout={density} />
                    ) : entries.total === 0 ? (
                        <Empty tab={tab} filtered={filtered} onAdd={() => setAdding(true)} />
                    ) : (
                        <>
                            {density === 'list' ? (
                                <ul className="crows" aria-busy={entries.isFetching}>
                                    {entries.items.map((e) => (
                                        <CollectionRow key={e.id} entry={e} />
                                    ))}
                                </ul>
                            ) : density === 'wall' ? (
                                <ul className="wall" aria-busy={entries.isFetching}>
                                    {entries.items.map((e) => (
                                        <WallTile key={e.id} entry={e} />
                                    ))}
                                </ul>
                            ) : (
                                <ul className="cgrid" aria-busy={entries.isFetching}>
                                    {entries.items.map((e) => (
                                        <CollectionCard key={e.id} entry={e} />
                                    ))}
                                </ul>
                            )}
                            <LoadMore
                                auto={density !== 'list'}
                                shown={entries.items.length}
                                total={entries.total}
                                hasMore={entries.hasNextPage}
                                loading={entries.isFetchingNextPage}
                                failed={entries.isFetchNextPageError}
                                onMore={() => entries.fetchNextPage()}
                                skeleton={
                                    <GridSkeletons
                                        layout={density}
                                        count={density === 'list' ? 3 : 6}
                                    />
                                }
                            />
                        </>
                    )}
                </>
            )}
            <AddGameDialog open={adding} onClose={() => setAdding(false)} />
        </section>
    );
}

/** What the bar along the bottom of each wall cover means. */
function WallLegend() {
    return (
        <div className="wall-legend">
            <p className="muted">
                Hover or focus a cover for details. The bar along its bottom edge shows its status.
            </p>
            <ul aria-label="Status colours">
                {ENTRY_STATUSES.map((s) => (
                    <li key={s}>
                        <span style={{ background: statusColorOnCover(s) }} aria-hidden="true" />
                        {statusText(s)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Empty({ tab, filtered, onAdd }: { tab: TabKey; filtered: boolean; onAdd: () => void }) {
    const label = TABS.find((t) => t.key === tab)?.label.toLowerCase();
    return (
        <div className="empty">
            <p>
                <strong>
                    {filtered
                        ? 'Nothing matches those filters.'
                        : tab === 'all'
                          ? 'No games yet.'
                          : `Nothing in ${label} yet.`}
                </strong>
            </p>
            {!filtered && tab === 'all' && (
                <button className="btn btn--primary" onClick={onAdd}>
                    <Plus aria-hidden="true" />
                    Add your first game
                </button>
            )}
        </div>
    );
}
