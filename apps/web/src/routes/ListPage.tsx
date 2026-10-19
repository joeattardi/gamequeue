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
import type { EntryDto } from '@gamequeue/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useEntries } from '../api/collection';
import { ApiRequestError } from '../api/client';
import {
    useAddToList,
    useDeleteList,
    useList,
    useRemoveFromList,
    useRenameList,
    useReorderList
} from '../api/lists';
import { useQueue } from '../api/queue';
import { useConfirm } from '../components/Confirm';
import { Cover } from '../components/Cover';
import { GameCard } from '../components/GameCard';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { ListLoading } from '../components/ListLoading';
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
    usePageTitle(list.data?.name);
    if (list.isPending)
        return <ListLoading icon={<List aria-hidden="true" />} layoutKey={LAYOUT_KEY} />;
    if (list.isError || !list.data)
        return (
            <div className="empty">
                <p>
                    <strong>That list doesn't exist.</strong>
                </p>
                <Link to="/lists">Back to lists</Link>
            </div>
        );
    return <ListView id={id} name={list.data.name} entries={list.data.entries} />;
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
    if (queue.isError || !queue.data)
        return (
            <p className="form-error" role="alert">
                Couldn't load your queue.
            </p>
        );
    return <ListView id={queue.data.id} name="Queue" entries={queue.data.entries} isQueue />;
}

function ListView({
    id,
    name,
    entries,
    isQueue = false
}: {
    id: number;
    name: string;
    entries: EntryDto[];
    isQueue?: boolean;
}) {
    const navigate = useNavigate();
    const reorder = useReorderList(id);
    const remove = useRemoveFromList();
    const del = useDeleteList(id);
    const confirm = useConfirm();
    // Reordering and removing only exist in the list layout; tiles are for browsing
    const [layout, setLayout] = useLayout(LAYOUT_KEY, 'list');
    const [order, setOrder] = useState(entries);
    const [error, setError] = useState<string>();
    useEffect(() => setOrder(entries), [entries]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function commit(next: EntryDto[]) {
        setOrder(next); // optimistic; the query refetches and corrects it if the save fails
        setError(undefined);
        reorder.mutate(
            next.map((e) => e.id),
            { onError: () => setError("Couldn't save the new order.") }
        );
    }

    function onDragEnd({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) return;
        const from = order.findIndex((e) => e.id === active.id);
        const to = order.findIndex((e) => e.id === over.id);
        commit(arrayMove(order, from, to));
    }

    const move = (index: number, by: -1 | 1) => commit(arrayMove(order, index, index + by));

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
                    </h1>
                    <p className="muted" aria-live="polite">
                        {order.length} {order.length === 1 ? 'game' : 'games'}
                        {isQueue && ' · starting a game takes it off the queue'}
                    </p>
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
                            <RenameButton id={id} name={name} />
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
                </div>
            </div>

            <AddGames listId={id} isQueue={isQueue} inList={new Set(order.map((e) => e.id))} />
            <p className="form-error" role="alert">
                {error}
            </p>

            {order.length === 0 ? (
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
                    <LayoutToggle layout={layout} onChange={setLayout} />
                    {layout === 'grid' ? (
                        <ol className="grid">
                            {order.map((entry, i) => (
                                <GameCard key={entry.id} entry={entry} position={i + 1} />
                            ))}
                        </ol>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={order.map((e) => e.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ol className="rows">
                                    {order.map((entry, i) => (
                                        <Row
                                            key={entry.id}
                                            entry={entry}
                                            index={i}
                                            last={i === order.length - 1}
                                            isQueue={isQueue}
                                            onMove={(by) => move(i, by)}
                                            onRemove={() =>
                                                remove.mutate({ listId: id, entryId: entry.id })
                                            }
                                        />
                                    ))}
                                </ol>
                            </SortableContext>
                        </DndContext>
                    )}
                </>
            )}
        </section>
    );
}

function Row({
    entry,
    index,
    last,
    isQueue,
    onMove,
    onRemove
}: {
    entry: EntryDto;
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
    } = useSortable({ id: entry.id });
    const { game } = entry;
    return (
        <li
            ref={setNodeRef}
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
                to={`/games/${entry.id}`}
                className="row-item__cover"
                tabIndex={-1}
                aria-hidden="true"
            >
                <Cover imageId={game.coverImageId} name={game.name} size="cover_big" />
            </Link>
            <div className="row-item__main">
                <Link to={`/games/${entry.id}`} className="row-item__title">
                    {game.name}
                </Link>
                <span className="muted">
                    <MetaLine
                        parts={[
                            yearOf(game.releaseDate),
                            <PlatformTags key="p" platforms={entry.platforms} />,
                            entry.ttbMinutes !== null ? formatMinutes(entry.ttbMinutes) : null
                        ]}
                    />
                </span>
                {entry.status !== 'unplayed' && (
                    <span className={`badge badge--${entry.status}`}>{entry.status}</span>
                )}
            </div>
            <div className="row-item__actions">
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

function RenameButton({ id, name }: { id: number; name: string }) {
    const rename = useRenameList(id);
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(name);
    const [error, setError] = useState<string>();
    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        rename.mutate(text.trim(), {
            onSuccess: () => setEditing(false),
            onError: (err) =>
                setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
        });
    }
    if (!editing)
        return (
            <button
                className="btn"
                onClick={() => {
                    setText(name);
                    setEditing(true);
                }}
            >
                <Pencil />
                Rename
            </button>
        );
    return (
        <form className="inline-form" onSubmit={submit}>
            <label className="field">
                <span className="sr-only">List name</span>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={60}
                    autoFocus
                />
            </label>
            <button
                className="btn btn--primary"
                type="submit"
                disabled={rename.isPending || !text.trim()}
            >
                Save
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setEditing(false)}>
                Cancel
            </button>
            {error && (
                <span className="form-error" role="alert">
                    {error}
                </span>
            )}
        </form>
    );
}

function AddGames({
    listId,
    inList,
    isQueue
}: {
    listId: number;
    inList: Set<number>;
    isQueue: boolean;
}) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 250);
    return (
        <div className="panel">
            <label className="field">
                <span>{isQueue ? 'Add games to the queue' : 'Add games from your collection'}</span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search by title…"
                    autoComplete="off"
                />
            </label>
            {q && <AddResults listId={listId} q={q} inList={inList} />}
        </div>
    );
}

function AddResults({ listId, q, inList }: { listId: number; q: string; inList: Set<number> }) {
    const results = useEntries(new URLSearchParams({ view: 'all', q }));
    const add = useAddToList();
    const matches = (results.data ?? []).filter((e) => !inList.has(e.id)).slice(0, 8);
    if (results.isPending)
        return (
            <ul className="results" aria-busy="true">
                <li className="sr-only" role="status">
                    Searching…
                </li>
                <ResultSkeletons trailing="badge" />
            </ul>
        );
    if (matches.length === 0)
        return (
            <p className="muted">
                {results.data?.length ? 'Already in this list.' : 'No matches.'}
            </p>
        );
    return (
        <ul className="results">
            {matches.map((e) => (
                <li key={e.id}>
                    <button
                        className="result"
                        disabled={add.isPending}
                        onClick={() => add.mutate({ listId, entryId: e.id })}
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
