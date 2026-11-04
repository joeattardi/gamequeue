import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ListItemDto } from '@gamequeue/shared';
import { ListOrdered, X } from 'lucide-react';
import { Link } from 'react-router';
import { useMoveInList } from '../api/lists';
import { useQueue, useRemoveFromQueue } from '../api/queue';
import { formatMinutes, yearOf } from '../lib';
import { useEntryLink } from '../pageTransitions';
import { UpNextSkeletons } from './HomeSkeletons';
import { Cover } from './Cover';
import { MetaLine } from './MetaLine';
import { PlatformTags } from './PlatformIcon';
import { StartPlayingButton } from './StartPlayingButton';
import { useSortableOrder } from './useSortableOrder';

const SHOWN = 8;

/**
 * The first few games on the queue, in order. Drag the handle (or focus it and use the arrow
 * keys) to reorder: the move is saved at once. Start takes the game off the queue.
 */
export function UpNext() {
    const queue = useQueue(SHOWN);
    // The queue only holds games you own, so every item has its entry
    const items = queue.items.filter((i) => i.entry);
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
            {queue.head && items.length > 0 && <QueueRows listId={queue.head.id} items={items} />}
            {total > items.length && items.length > 0 && (
                <p className="muted upnext__more">
                    <Link to="/queue">{total - items.length} more on your queue</Link>
                </p>
            )}
        </section>
    );
}

function QueueRows({ listId, items }: { listId: number; items: ListItemDto[] }) {
    const reorder = useMoveInList(listId);
    const { order, sensors, onDragEnd, commit, error } = useSortableOrder(
        items,
        (igdbId, toIndex, onError) => reorder.mutate({ igdbId, toIndex }, { onError })
    );
    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                    items={order.map((i) => i.igdbId)}
                    strategy={verticalListSortingStrategy}
                >
                    <ol className="upnext-rows">
                        {order.map((item, i) => (
                            <UpNextRow
                                key={item.igdbId}
                                item={item}
                                index={i}
                                onMove={(by) => commit(i, i + by)}
                            />
                        ))}
                    </ol>
                </SortableContext>
            </DndContext>
            <p className="form-error" role="alert">
                {error}
            </p>
        </>
    );
}

function UpNextRow({
    item,
    index,
    onMove
}: {
    item: ListItemDto;
    index: number;
    onMove: (by: -1 | 1) => void;
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
    const remove = useRemoveFromQueue();
    const entry = item.entry!;
    const { game } = item;
    const link = useEntryLink(entry);
    const ttb = entry.ttbMinutes;
    return (
        <li
            ref={setNodeRef}
            className={`upnext-row${isDragging ? ' upnext-row--dragging' : ''}`}
            style={{ transform: CSS.Transform.toString(transform), transition }}
        >
            <button
                ref={setActivatorNodeRef}
                className="handle"
                aria-label={`Reorder ${game.name}, position ${index + 1}. Press space, then use the arrow keys.`}
                onKeyDown={(e) => {
                    // Quick keyboard nudge without entering drag mode
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                        e.preventDefault();
                        onMove(e.key === 'ArrowUp' ? -1 : 1);
                    }
                }}
                {...attributes}
                {...listeners}
            >
                ⠿
            </button>
            <span className="upnext-row__pos" aria-hidden="true">
                {index + 1}
            </span>
            <Link
                to={link.to}
                onClick={link.onClick}
                className="upnext-row__cover"
                tabIndex={-1}
                aria-hidden="true"
            >
                <Cover
                    imageId={game.coverImageId}
                    name={game.name}
                    transitionName={link.coverTransition}
                />
            </Link>
            <div className="upnext-row__main">
                <Link to={link.to} onClick={link.onClick} className="upnext-row__title">
                    {game.name}
                </Link>
                <span className="muted upnext-row__meta">
                    <MetaLine
                        parts={[
                            yearOf(game.releaseDate),
                            <PlatformTags key="p" platforms={entry.platforms} />,
                            ttb !== null ? formatMinutes(ttb) : null
                        ]}
                    />
                </span>
            </div>
            <div className="upnext-row__actions">
                <StartPlayingButton entry={entry} className="btn btn--primary" />
                <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label={`Remove ${game.name} from the queue`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.igdbId)}
                >
                    <X aria-hidden="true" />
                </button>
            </div>
        </li>
    );
}
