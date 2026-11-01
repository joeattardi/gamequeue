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
    MAX_LIST_DESCRIPTION,
    availableActions,
    statusLabel,
    type ListItemDto,
    type SearchResultDto
} from '@gamequeue/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useEntries, useGameSearch } from '../api/collection';
import { ApiRequestError } from '../api/client';
import {
    useAddToList,
    useDeleteList,
    useList,
    useRemoveFromList,
    useUpdateList,
    useMoveInList
} from '../api/lists';
import { useQueue } from '../api/queue';
import { StartPlayingButton } from '../components/StartPlayingButton';
import { CountBadge } from '../components/CountBadge';
import { useConfirm } from '../components/Confirm';
import { Cover } from '../components/Cover';
import { reveal } from '../components/motion';
import { useGameLink } from '../pageTransitions';
import { GameCard } from '../components/GameCard';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { LoadMore } from '../components/LoadMore';
import { ListLoading } from '../components/ListLoading';
import { GridSkeletons, RowSkeletons } from '../components/GridSkeletons';
import { ResultSkeletons } from '../components/ResultSkeletons';
import { MetaLine } from '../components/MetaLine';
import { PlatformTags } from '../components/PlatformIcon';
import { formatMinutes, useDebounced, yearOf, usePageTitle } from '../lib';
import {
    ArrowLeft,
    ChevronDown,
    ChevronUp,
    FileSpreadsheet,
    List,
    ListOrdered,
    Pencil,
    Trash2,
    X
} from 'lucide-react';

const LAYOUT_KEY = 'gq_list_layout';

export function ListPage() {
    const id = Number(useParams().id);
    const list = useList(id);
    usePageTitle(list.head?.name);
    if (list.isPending)
        return <ListLoading icon={<List aria-hidden="true" />} layoutKey={LAYOUT_KEY} />;
    if (list.isError || !list.head)
        return (
            <div className="empty">
                <p>
                    <strong>That list doesn't exist.</strong>
                </p>
                <Link to="/lists">Back to lists</Link>
            </div>
        );
    return (
        <ListView id={id} name={list.head.name} description={list.head.description} paged={list} />
    );
}

export function QueuePage() {
    const queue = useQueue();
    usePageTitle('Queue');
    if (queue.isPending)
        return (
            <ListLoading
                icon={<ListOrdered aria-hidden="true" />}
                title="Queue"
                layoutKey={LAYOUT_KEY}
            />
        );
    if (queue.isError || !queue.head)
        return (
            <p className="form-error" role="alert">
                Couldn't load your queue.
            </p>
        );
    return <ListView id={queue.head.id} name="Queue" paged={queue} isQueue />;
}

/** What a list page needs from `useList`/`useQueue`: the games loaded so far and how to get more. */
type Paged = Pick<
    ReturnType<typeof useList>,
    | 'items'
    | 'total'
    | 'hasNextPage'
    | 'isFetchingNextPage'
    | 'isFetchNextPageError'
    | 'fetchNextPage'
>;

function ListView({
    id,
    name,
    description = '',
    paged,
    isQueue = false
}: {
    id: number;
    name: string;
    description?: string;
    paged: Paged;
    isQueue?: boolean;
}) {
    const navigate = useNavigate();
    const items = paged.items;
    const total = paged.total ?? items.length;
    const reorder = useMoveInList(id);
    const remove = useRemoveFromList();
    const del = useDeleteList(id);
    const confirm = useConfirm();
    // Reordering and removing only exist in the list layout; tiles are for browsing
    const [layout, setLayout] = useLayout(LAYOUT_KEY, 'list');
    const [order, setOrder] = useState(items);
    const [error, setError] = useState<string>();
    const [editing, setEditing] = useState(false);
    useEffect(() => setOrder(items), [items]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Only the first pages are loaded, so an index here is also the game's index in the whole
    // list, and the server moves just that one game.
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
            order.findIndex((e) => e.igdbId === active.id),
            order.findIndex((e) => e.igdbId === over.id)
        );
    }

    const move = (index: number, by: -1 | 1) => commit(index, index + by);

    return (
        <section>
            {!isQueue && (
                <Link to="/lists" className="back">
                    <ArrowLeft /> Lists
                </Link>
            )}
            <div className="page-head">
                <div>
                    <h1>
                        {isQueue ? <ListOrdered aria-hidden="true" /> : <List aria-hidden="true" />}
                        {name}
                        <CountBadge total={total} />
                    </h1>
                    {isQueue && <p className="muted">Starting a game takes it off the queue</p>}
                </div>
                <div className="row">
                    <Link className="btn btn--primary" to={`/pick/criteria?list=${id}`}>
                        Random pick
                    </Link>
                    <a className="btn" href={`/api/lists/${id}/export.csv`} download>
                        <FileSpreadsheet />
                        Export CSV
                    </a>
                    {!isQueue && (
                        <>
                            <button
                                className="btn"
                                onClick={() => setEditing((on) => !on)}
                                aria-expanded={editing}
                            >
                                <Pencil />
                                Edit
                            </button>
                            <button
                                className="btn btn--danger"
                                disabled={del.isPending}
                                onClick={async () =>
                                    (await confirm({
                                        title: `Delete “${name}”?`,
                                        message:
                                            'The list will be removed. Your games are not affected.',
                                        confirmLabel: 'Delete list',
                                        tone: 'danger'
                                    })) &&
                                    del.mutate(undefined, { onSuccess: () => navigate('/lists') })
                                }
                            >
                                <Trash2 />
                                Delete list
                            </button>
                        </>
                    )}
                    {total > 0 && <LayoutToggle layout={layout} onChange={setLayout} />}
                </div>
            </div>

            {editing ? (
                <EditListForm
                    id={id}
                    name={name}
                    description={description}
                    onDone={() => setEditing(false)}
                />
            ) : (
                description && <p className="list-description">{description}</p>
            )}

            <AddGames listId={id} isQueue={isQueue} inList={new Set(items.map((i) => i.igdbId))} />
            <p className="form-error" role="alert">
                {error}
            </p>

            {total === 0 ? (
                <div className="empty">
                    <p>
                        <strong>{isQueue ? 'Your queue is empty.' : 'This list is empty.'}</strong>
                    </p>
                    <p className="muted">
                        {isQueue
                            ? 'Search above to line up what to play next. Any game in your collection can go on it.'
                            : 'Search above to add games from your collection.'}
                    </p>
                </div>
            ) : (
                <>
                    {layout === 'grid' ? (
                        <ol className="grid">
                            {order.map((item, i) =>
                                item.entry ? (
                                    <GameCard
                                        key={item.igdbId}
                                        entry={item.entry}
                                        position={i + 1}
                                    />
                                ) : (
                                    <UnownedTile key={item.igdbId} item={item} position={i + 1} />
                                )
                            )}
                        </ol>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={order.map((e) => e.igdbId)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ol className="rows">
                                    {order.map((item, i) => (
                                        <Row
                                            key={item.igdbId}
                                            item={item}
                                            index={i}
                                            last={i === order.length - 1}
                                            isQueue={isQueue}
                                            onMove={(by) => move(i, by)}
                                            onRemove={() =>
                                                remove.mutate({ listId: id, igdbId: item.igdbId })
                                            }
                                        />
                                    ))}
                                </ol>
                            </SortableContext>
                        </DndContext>
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
        </section>
    );
}

/** A game on the list that isn't in your collection: links to its IGDB page, where it can be added. */
function UnownedTile({ item, position }: { item: ListItemDto; position: number }) {
    const { game } = item;
    return (
        <li className="card" ref={reveal}>
            <Link to={`/games/igdb/${item.igdbId}`} className="card__link">
                <div className="card__art">
                    <Cover imageId={game.coverImageId} name={game.name} />
                    <div className="card__info">
                        <strong className="card__title">{game.name}</strong>
                        <span className="muted card__sub">Not in your collection</span>
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
    isQueue,
    onMove,
    onRemove
}: {
    item: ListItemDto;
    isQueue: boolean;
    index: number;
    last: boolean;
    onMove: (by: -1 | 1) => void;
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
    const { game, entry } = item;
    const link = useGameLink(entry, item.igdbId);
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
                to={link.to}
                onClick={link.onClick}
                className="row-item__cover"
                tabIndex={-1}
                aria-hidden="true"
            >
                <Cover
                    imageId={game.coverImageId}
                    name={game.name}
                    size="cover_big"
                    transitionName={link.coverTransition}
                />
            </Link>
            <div className="row-item__main">
                <Link to={link.to} onClick={link.onClick} className="row-item__title">
                    {game.name}
                </Link>
                <span className="muted">
                    <MetaLine
                        parts={[
                            yearOf(game.releaseDate),
                            <PlatformTags
                                key="p"
                                platforms={entry ? entry.platforms : game.platforms.slice(0, 4)}
                            />,
                            (entry ? entry.ttbMinutes : (game.ttb?.normally ?? null)) !== null
                                ? formatMinutes((entry ? entry.ttbMinutes : game.ttb?.normally)!)
                                : null
                        ]}
                    />
                </span>
                {entry ? (
                    (!isQueue || entry.status !== 'unplayed') && (
                        <span
                            className={`badge ${entry.status === 'unplayed' ? 'badge--quiet' : `badge--${entry.status}`}`}
                        >
                            {statusLabel(entry.status)}
                        </span>
                    )
                ) : (
                    <span className="badge badge--quiet">Not in collection</span>
                )}
            </div>
            <div className="row-item__actions">
                {isQueue && entry && availableActions(entry.status).includes('start') && (
                    <StartPlayingButton entry={entry} className="btn btn--small btn--primary" />
                )}
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
                    aria-label={`Remove ${game.name} from this ${isQueue ? 'queue' : 'list'}`}
                >
                    <X />
                </button>
            </div>
        </li>
    );
}

/** Name and description of a list, edited in place under the heading. */
function EditListForm({
    id,
    name,
    description,
    onDone
}: {
    id: number;
    name: string;
    description: string;
    onDone: () => void;
}) {
    const update = useUpdateList(id);
    const [nameText, setNameText] = useState(name);
    const [descText, setDescText] = useState(description);
    const [error, setError] = useState<string>();
    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        update.mutate(
            { name: nameText.trim(), description: descText.trim() },
            {
                onSuccess: onDone,
                onError: (err) =>
                    setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
            }
        );
    }
    return (
        <form className="panel stack" onSubmit={submit}>
            <label className="field">
                <span>Name</span>
                <input
                    value={nameText}
                    onChange={(e) => setNameText(e.target.value)}
                    maxLength={60}
                    autoFocus
                />
            </label>
            <label className="field">
                <span>Description (optional)</span>
                <textarea
                    value={descText}
                    onChange={(e) => setDescText(e.target.value)}
                    maxLength={MAX_LIST_DESCRIPTION}
                    rows={3}
                />
            </label>
            {error && (
                <span className="form-error" role="alert">
                    {error}
                </span>
            )}
            <div className="row">
                <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={update.isPending || !nameText.trim()}
                >
                    Save
                </button>
                <button className="btn btn--ghost" type="button" onClick={onDone}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function AddGames({
    listId,
    isQueue,
    inList
}: {
    listId: number;
    isQueue: boolean;
    inList: Set<number>;
}) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 250);
    return (
        <div className="panel">
            <label className="field">
                <span>
                    {isQueue
                        ? 'Add games from your collection to the queue'
                        : 'Add any game: search IGDB, owned or not'}
                </span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search by title…"
                    autoComplete="off"
                />
            </label>
            {q &&
                (isQueue ? (
                    <QueueAddResults listId={listId} q={q} />
                ) : (
                    <AddResults listId={listId} q={q} inList={inList} />
                ))}
        </div>
    );
}

/** The queue takes games you own, so it searches your collection. */
function QueueAddResults({ listId, q }: { listId: number; q: string }) {
    // Entries say whether they are queued, so membership doesn't depend on what the page has loaded
    const results = useEntries(new URLSearchParams({ view: 'all', q }), 20);
    const add = useAddToList();
    const matches = (results.data?.entries ?? []).filter((e) => !e.queued).slice(0, 8);
    if (results.isPending) return <SearchingResults />;
    if (matches.length === 0)
        return (
            <p className="muted">{results.data?.total ? 'Already in this list.' : 'No matches.'}</p>
        );
    return (
        <ul className="results">
            {matches.map((e) => (
                <li key={e.id}>
                    <button
                        className="result"
                        disabled={add.isPending}
                        onClick={() => add.mutate({ listId, igdbId: e.game.id })}
                    >
                        <Cover imageId={e.game.coverImageId} name={e.game.name} size="cover_big" />
                        <span className="result__text">
                            <strong>{e.game.name}</strong>
                            <span className="muted">
                                <MetaLine
                                    parts={[
                                        yearOf(e.game.releaseDate),
                                        <PlatformTags key="p" platforms={e.platforms} />
                                    ]}
                                />
                            </span>
                        </span>
                        <span className="badge">+ Add</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function SearchingResults() {
    return (
        <ul className="results" aria-busy="true">
            <li className="sr-only" role="status">
                Searching…
            </li>
            <ResultSkeletons trailing="badge" />
        </ul>
    );
}

/** A regular list takes any game, so it searches IGDB; games already on the list are marked. */
function AddResults({ listId, q, inList }: { listId: number; q: string; inList: Set<number> }) {
    const search = useGameSearch(q);
    const add = useAddToList();
    const [error, setError] = useState<string>();
    if (search.isPending) return <SearchingResults />;
    if (search.isError)
        return (
            <p className="form-error" role="alert">
                {search.error instanceof ApiRequestError ? search.error.message : 'Search failed.'}
            </p>
        );
    const hits: SearchResultDto[] = (search.data ?? []).slice(0, 8);
    if (hits.length === 0) return <p className="muted">No matches.</p>;
    return (
        <>
            <ul className="results">
                {hits.map((r) => {
                    const here = inList.has(r.igdbId);
                    return (
                        <li key={r.igdbId}>
                            <button
                                className="result"
                                disabled={add.isPending || here}
                                onClick={() => {
                                    setError(undefined);
                                    add.mutate(
                                        { listId, igdbId: r.igdbId },
                                        {
                                            onError: (e) =>
                                                setError(
                                                    e instanceof ApiRequestError
                                                        ? e.message
                                                        : "Couldn't add the game."
                                                )
                                        }
                                    );
                                }}
                            >
                                <Cover imageId={r.coverImageId} name={r.name} size="cover_big" />
                                <span className="result__text">
                                    <strong>{r.name}</strong>
                                    <span className="muted">
                                        <MetaLine
                                            parts={[
                                                r.year,
                                                <PlatformTags
                                                    key="p"
                                                    platforms={r.platforms.slice(0, 4)}
                                                />,
                                                r.entryId !== null ? 'In your collection' : null
                                            ]}
                                        />
                                    </span>
                                </span>
                                <span className="badge">{here ? 'On the list' : '+ Add'}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <p className="form-error" role="alert">
                {error}
            </p>
        </>
    );
}
