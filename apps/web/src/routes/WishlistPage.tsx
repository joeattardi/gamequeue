import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    MAX_WISHLIST_NOTE,
    type GamePriceDto,
    type SearchResultDto,
    type WishlistItemDto
} from '@gamequeue/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
    usePatchWishlistItem,
    useRemoveFromWishlist,
    useMoveInWishlist,
    useWishlist
} from '../api/wishlist';
import { CountBadge } from '../components/CountBadge';
import { AddGameDialog } from '../components/AddGameDialog';
import { Cover } from '../components/Cover';
import { reveal } from '../components/motion';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { LoadMore } from '../components/LoadMore';
import { GridSkeletons, RowSkeletons } from '../components/GridSkeletons';
import { ListLoading } from '../components/ListLoading';
import { MetaLine } from '../components/MetaLine';
import { formatPrice, releaseBadgeText, releaseText, usePageTitle } from '../lib';
import { ChevronDown, ChevronUp, Gift, Plus, ShoppingCart, X } from 'lucide-react';

const LAYOUT_KEY = 'gq_wishlist_layout';

export function WishlistPage() {
    usePageTitle('Wishlist');
    const wishlist = useWishlist();
    if (wishlist.isPending)
        return (
            <ListLoading
                icon={<Gift aria-hidden="true" />}
                title="Wishlist"
                layoutKey={LAYOUT_KEY}
            />
        );
    if (wishlist.isError || !wishlist.head)
        return (
            <p className="form-error" role="alert">
                Couldn't load your wishlist.
            </p>
        );
    return <WishlistView paged={wishlist} />;
}

/** What the add dialog needs to move a wishlisted game into the collection. */
const asSearchResult = (item: WishlistItemDto): SearchResultDto => ({
    igdbId: item.igdbId,
    name: item.game.name,
    year: item.game.releaseDate ? Number(item.game.releaseDate.slice(0, 4)) : null,
    coverImageId: item.game.coverImageId,
    igdbRating: item.game.igdbRating,
    platforms: item.game.platforms,
    entryId: null,
    wishlisted: true
});

function WishlistView({ paged }: { paged: ReturnType<typeof useWishlist> }) {
    const items = paged.items;
    const total = paged.total ?? items.length;
    const reorder = useMoveInWishlist();
    const remove = useRemoveFromWishlist();
    const [order, setOrder] = useState(items);
    const [error, setError] = useState<string>();
    const [adding, setAdding] = useState(false);
    const [acquiring, setAcquiring] = useState<WishlistItemDto>();
    // Reordering, notes and the other actions only exist in the list layout; tiles are for browsing
    const [layout, setLayout] = useLayout(LAYOUT_KEY, 'list');
    useEffect(() => setOrder(items), [items]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Only the first pages are loaded, so an index here is also the game's index in the whole
    // wishlist, and the server moves just that one game.
    function commit(from: number, to: number) {
        const igdbId = order[from]!.igdbId;
        setOrder(arrayMove(order, from, to)); // optimistic; the query refetches and corrects it if the save fails
        setError(undefined);
        reorder.mutate(
            { igdbId, toIndex: to },
            { onError: () => setError("Couldn't save the new order.") }
        );
    }

    function onDragEnd({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) return;
        commit(
            order.findIndex((i) => i.igdbId === active.id),
            order.findIndex((i) => i.igdbId === over.id)
        );
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Gift aria-hidden="true" />
                        Wishlist
                        <CountBadge total={total} />
                    </h1>
                    <p className="muted">Top of the list is what you want most</p>
                </div>
                <div className="row">
                    <button className="btn btn--primary" onClick={() => setAdding(true)}>
                        <Plus />
                        Add to wishlist
                    </button>
                    {total > 0 && <LayoutToggle layout={layout} onChange={setLayout} />}
                </div>
            </div>

            <p className="form-error" role="alert">
                {error}
            </p>

            {total === 0 ? (
                <div className="empty">
                    <p>
                        <strong>Your wishlist is empty.</strong>
                    </p>
                    <p className="muted">
                        Add games you want but don't own yet. When you get one, move it into your
                        collection from here.
                    </p>
                </div>
            ) : (
                <>
                    {layout === 'grid' ? (
                        <ol className="grid">
                            {order.map((item, i) => (
                                <WishlistTile key={item.igdbId} item={item} position={i + 1} />
                            ))}
                        </ol>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={order.map((i) => i.igdbId)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ol className="rows">
                                    {order.map((item, i) => (
                                        <Row
                                            key={item.igdbId}
                                            item={item}
                                            index={i}
                                            last={i === order.length - 1}
                                            onMove={(by) => commit(i, i + by)}
                                            onAcquire={() => setAcquiring(item)}
                                            onRemove={() => remove.mutate(item.igdbId)}
                                        />
                                    ))}
                                </ol>
                            </SortableContext>
                        </DndContext>
                    )}
                    {order.some((i) => i.price) && (
                        <p className="muted price-credit">
                            Prices from{' '}
                            <a
                                href="https://isthereanydeal.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                IsThereAnyDeal
                            </a>
                            , refreshed every few hours.
                        </p>
                    )}
                    <LoadMore
                        shown={order.length}
                        total={total}
                        hasMore={paged.hasNextPage}
                        loading={paged.isFetchingNextPage}
                        failed={paged.isFetchNextPageError}
                        onMore={() => paged.fetchNextPage()}
                        skeleton={
                            layout === 'grid' ? (
                                <GridSkeletons layout="grid" count={4} />
                            ) : (
                                <RowSkeletons count={3} />
                            )
                        }
                    />
                </>
            )}

            <AddGameDialog open={adding} onClose={() => setAdding(false)} mode="wishlist" />
            <AddGameDialog
                // A fresh dialog per game, so it starts on that game's platform step
                key={acquiring?.igdbId}
                open={acquiring !== undefined}
                onClose={() => setAcquiring(undefined)}
                initial={
                    acquiring
                        ? {
                              game: asSearchResult(acquiring),
                              platformId: acquiring.platform?.id ?? null
                          }
                        : undefined
                }
            />
        </section>
    );
}

/** Over the box art of a game that isn't out yet: how long until it is, or its vague date. */
function ReleaseBadge({ game }: { game: WishlistItemDto['game'] }) {
    const text = releaseBadgeText(game);
    if (!text) return null;
    // The cover's alt text and the meta line already name the game and date for assistive tech
    return (
        <span className="release-badge" title={`Releases ${releaseText(game)}`}>
            {text}
        </span>
    );
}

/** Cheapest current price, with the discount and the lowest price ever when ITAD has them. */
function PriceLine({ price, name }: { price: GamePriceDto; name: string }) {
    const money = (n: number) => formatPrice(n, price.currency);
    return (
        <span className="price-line">
            <a
                href={price.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name}: ${money(price.amount)} at ${price.shop}${
                    price.cut ? `, ${price.cut}% off` : ''
                } (opens in a new tab)`}
            >
                <strong>{money(price.amount)}</strong> at {price.shop}
            </a>
            {price.cut > 0 && (
                <span className="price-line__cut">
                    −{price.cut}% <s className="muted">{money(price.regular)}</s>
                </span>
            )}
            {price.historyLow !== null && (
                <span className="muted">
                    {price.amount <= price.historyLow
                        ? 'Lowest price ever'
                        : `Lowest ever ${money(price.historyLow)}`}
                </span>
            )}
        </span>
    );
}

/** Box art for a wishlisted game; it isn't owned, so there's no game page to open. */
function WishlistTile({ item, position }: { item: WishlistItemDto; position: number }) {
    const { game } = item;
    return (
        <li className="card" ref={reveal}>
            <Link to={`/games/igdb/${item.igdbId}`} className="card__link">
                <div className="card__art">
                    <Cover imageId={game.coverImageId} name={game.name} />
                    <ReleaseBadge game={game} />
                    <div className="card__info">
                        <strong className="card__title">{game.name}</strong>
                        <span className="muted card__sub">
                            <MetaLine
                                parts={[
                                    releaseText(game),
                                    item.platform?.name,
                                    item.price &&
                                        `${formatPrice(item.price.amount, item.price.currency)}${
                                            item.price.cut ? ` (−${item.price.cut}%)` : ''
                                        }`
                                ]}
                            />
                        </span>
                        {item.note && <span className="muted card__note">{item.note}</span>}
                    </div>
                    <span className="card__pos">{position}</span>
                </div>
            </Link>
        </li>
    );
}

function Row({
    item,
    index,
    last,
    onMove,
    onAcquire,
    onRemove
}: {
    item: WishlistItemDto;
    index: number;
    last: boolean;
    onMove: (by: -1 | 1) => void;
    onAcquire: () => void;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.igdbId });
    const nodeRef = useCallback(
        (el: HTMLElement | null) => {
            setNodeRef(el);
            reveal(el);
        },
        [setNodeRef]
    );
    const patch = usePatchWishlistItem();
    const [note, setNote] = useState(item.note);
    const [error, setError] = useState<string>();
    useEffect(() => setNote(item.note), [item.note]);
    const { game } = item;

    // Platforms IGDB lists for the game; keep the saved one selectable even if it isn't among them
    const options = game.platforms.some((p) => p.id === item.platform?.id)
        ? game.platforms
        : item.platform
          ? [item.platform, ...game.platforms]
          : game.platforms;

    const save = (p: { platformId?: number | null; note?: string }) => {
        setError(undefined);
        patch.mutate(
            { igdbId: item.igdbId, patch: p },
            { onError: () => setError("Couldn't save that.") }
        );
    };

    return (
        <li
            ref={nodeRef}
            className={`row-item${isDragging ? ' row-item--dragging' : ''}`}
            style={{ transform: CSS.Transform.toString(transform), transition }}
        >
            <button
                ref={setActivatorNodeRef}
                className="handle"
                aria-label={`Reorder ${game.name}. Press space, then use the arrow keys.`}
                {...attributes}
                {...listeners}
            >
                ⠿
            </button>
            <span className="row-item__pos muted" aria-hidden="true">
                {index + 1}
            </span>
            <Link
                to={`/games/igdb/${item.igdbId}`}
                className="row-item__cover"
                aria-hidden="true"
                tabIndex={-1}
            >
                <Cover imageId={game.coverImageId} name={game.name} size="cover_big" />
                <ReleaseBadge game={game} />
            </Link>
            <div className="row-item__main">
                <Link to={`/games/igdb/${item.igdbId}`} className="row-item__title">
                    <strong>{game.name}</strong>
                </Link>
                <span className="muted">{releaseText(game)}</span>
                {item.price && <PriceLine price={item.price} name={game.name} />}
                <div className="wish-fields">
                    <label className="field">
                        <span className="sr-only">Platform to buy {game.name} on</span>
                        <select
                            value={item.platform?.id ?? ''}
                            onChange={(e) =>
                                save({ platformId: e.target.value ? Number(e.target.value) : null })
                            }
                            disabled={patch.isPending}
                        >
                            <option value="">Any platform</option>
                            {options.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field">
                        <span className="sr-only">Note about {game.name}</span>
                        <input
                            value={note}
                            maxLength={MAX_WISHLIST_NOTE}
                            placeholder="Note, e.g. wait for a sale"
                            onChange={(e) => setNote(e.target.value)}
                            onBlur={() => note !== item.note && save({ note })}
                        />
                    </label>
                </div>
                {error && (
                    <span className="form-error" role="alert">
                        {error}
                    </span>
                )}
            </div>
            <div className="row-item__actions">
                <button
                    className="btn btn--ghost"
                    onClick={onAcquire}
                    aria-label={`I got ${game.name}: add it to my collection`}
                    title="Got it: add to collection"
                >
                    <ShoppingCart />
                </button>
                <button
                    className="btn btn--ghost"
                    disabled={index === 0}
                    onClick={() => onMove(-1)}
                    aria-label={`Move ${game.name} up`}
                >
                    <ChevronUp />
                </button>
                <button
                    className="btn btn--ghost"
                    disabled={last}
                    onClick={() => onMove(1)}
                    aria-label={`Move ${game.name} down`}
                >
                    <ChevronDown />
                </button>
                <button
                    className="btn btn--ghost btn--danger"
                    onClick={onRemove}
                    aria-label={`Remove ${game.name} from the wishlist`}
                >
                    <X />
                </button>
            </div>
        </li>
    );
}
