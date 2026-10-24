import type { GridDto } from '@gamequeue/shared';
import { Plus } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Cover } from './Cover';

/**
 * A grid as a board of labelled covers. Read-only for the public page; with `onSelect` each cell is
 * a button that opens it for editing, and with `onSwap` cells can be dragged onto each other.
 */
export function GridBoard({
    grid,
    onSelect,
    onSwap
}: {
    grid: Pick<GridDto, 'cols' | 'cells' | 'title'>;
    onSelect?: (position: number) => void;
    onSwap?: (a: number, b: number) => void;
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const editable = onSelect !== undefined;

    return (
        <ol
            className="grid-board"
            style={{ '--grid-cols': grid.cols } as CSSProperties}
            aria-label={grid.title}
        >
            {grid.cells.map((c) => {
                const body = (
                    <>
                        <span className="grid-cell__label">{c.label || <i>&nbsp;</i>}</span>
                        <span className="grid-cell__art">
                            {c.game ? (
                                <Cover
                                    imageId={c.game.coverImageId}
                                    name={c.game.name}
                                    size="cover_big"
                                />
                            ) : (
                                <span className="grid-cell__empty" aria-hidden="true">
                                    {editable && <Plus />}
                                </span>
                            )}
                        </span>
                        <span className="grid-cell__name">
                            {c.game ? c.game.name : editable ? 'Choose a game' : ''}
                        </span>
                    </>
                );
                const classes = [
                    'grid-cell',
                    editable && 'grid-cell--editable',
                    over === c.position && dragging !== c.position && 'is-over',
                    dragging === c.position && 'is-dragging'
                ]
                    .filter(Boolean)
                    .join(' ');
                return (
                    <li
                        key={c.position}
                        className={classes}
                        draggable={editable && !!onSwap}
                        onDragStart={() => setDragging(c.position)}
                        onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                        }}
                        onDragOver={(e) => {
                            if (dragging === null) return;
                            e.preventDefault();
                            setOver(c.position);
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragging !== null && dragging !== c.position)
                                onSwap?.(dragging, c.position);
                            setDragging(null);
                            setOver(null);
                        }}
                    >
                        {editable ? (
                            <button
                                type="button"
                                className="grid-cell__button"
                                onClick={() => onSelect(c.position)}
                                aria-label={`${c.label || `Cell ${c.position + 1}`}: ${c.game ? c.game.name : 'empty'}. Edit`}
                            >
                                {body}
                            </button>
                        ) : (
                            <div className="grid-cell__button">{body}</div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

/** Placeholder with the board's real classes, so the page doesn't jump when the grid arrives. */
export function GridBoardSkeleton({ cols = 3, rows = 3 }: { cols?: number; rows?: number }) {
    return (
        <ol
            className="grid-board"
            style={{ '--grid-cols': cols } as CSSProperties}
            role="status"
            aria-label="Loading grid"
        >
            {Array.from({ length: cols * rows }, (_, i) => (
                <li key={i} className="grid-cell" aria-hidden="true">
                    <div className="grid-cell__button">
                        <span className="skeleton skeleton--line grid-cell__label-skeleton" />
                        <span className="grid-cell__art">
                            <span className="skeleton grid-cell__art-skeleton" />
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    );
}
