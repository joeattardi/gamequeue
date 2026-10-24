import {
    GRID_LABEL_PROMPTS,
    GRID_MAX_SIZE,
    MAX_CELL_LABEL,
    MAX_GRID_DESCRIPTION,
    MAX_GRID_TITLE,
    type GridDto,
    type SearchResultDto
} from '@gamequeue/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import {
    useDeleteGrid,
    useGrid,
    usePatchGrid,
    useSetGridCell,
    useSwapGridCells
} from '../api/grids';
import { useConfirm } from '../components/Confirm';
import { DownloadGridImage } from '../components/DownloadGridImage';
import { GameSearchPicker } from '../components/GameSearchPicker';
import { GridBoard, GridBoardSkeleton } from '../components/GridBoard';
import { LabelCombobox } from '../components/LabelCombobox';
import { ShareLink } from '../components/ShareLink';
import { useModalDialog } from '../components/useModalDialog';
import { usePageTitle } from '../lib';

const SIZES = Array.from({ length: GRID_MAX_SIZE }, (_, i) => i + 1);
const message = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

/** The grid editor: details, the board (click a cell to fill it, drag to rearrange) and the share link. */
export function GridPage() {
    const id = Number(useParams().id);
    const grid = useGrid(id);
    const me = useMe();
    const swap = useSwapGridCells(id);
    const [selected, setSelected] = useState<number | null>(null);
    const [error, setError] = useState<string>();
    usePageTitle(grid.data?.title ?? 'Grid');

    if (grid.isError)
        return (
            <section>
                <Link to="/grids" className="back-link">
                    <ArrowLeft aria-hidden="true" /> Grids
                </Link>
                <p role="alert">
                    {grid.error instanceof ApiRequestError && grid.error.status === 404
                        ? 'That grid does not exist.'
                        : "Couldn't load the grid."}
                </p>
            </section>
        );

    return (
        <section className="grid-page">
            <Link to="/grids" className="back-link">
                <ArrowLeft aria-hidden="true" /> Grids
            </Link>
            {grid.data ? (
                <>
                    <h1>{grid.data.title}</h1>
                    <p className="muted">
                        Click a cell to choose its game and label. Drag cells to rearrange them.
                    </p>
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                    <GridBoard
                        grid={grid.data}
                        onSelect={setSelected}
                        onSwap={(a, b) => {
                            setError(undefined);
                            swap.mutate({ a, b }, { onError: (e) => setError(message(e)) });
                        }}
                    />
                    <div className="grid-page__side">
                        {me.data && (
                            <ShareLink path={`/u/${me.data.username}/grids/${grid.data.id}`} />
                        )}
                        <DownloadGridImage grid={grid.data} username={me.data?.username} />
                        <Details grid={grid.data} />
                    </div>
                    <CellDialog
                        grid={grid.data}
                        position={selected}
                        onMove={setSelected}
                        onClose={() => setSelected(null)}
                    />
                </>
            ) : (
                <GridBoardSkeleton />
            )}
        </section>
    );
}

function Details({ grid }: { grid: GridDto }) {
    const patch = usePatchGrid(grid.id);
    const del = useDeleteGrid();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [title, setTitle] = useState(grid.title);
    const [description, setDescription] = useState(grid.description);
    const [cols, setCols] = useState(grid.cols);
    const [rows, setRows] = useState(grid.rows);
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        setSaved(false);
        const shrinks = cols < grid.cols || rows < grid.rows;
        const dropped = shrinks
            ? grid.cells.filter(
                  (c) =>
                      (c.game || c.label) &&
                      (Math.floor(c.position / grid.cols) >= rows || c.position % grid.cols >= cols)
              ).length
            : 0;
        if (
            dropped > 0 &&
            !(await confirm({
                title: 'Shrink the grid?',
                message: `${dropped} filled ${dropped === 1 ? 'cell falls' : 'cells fall'} outside the new size and will be removed.`,
                confirmLabel: 'Shrink',
                tone: 'danger'
            }))
        )
            return;
        patch.mutate(
            { title: title.trim(), description: description.trim(), cols, rows },
            { onSuccess: () => setSaved(true), onError: (err) => setError(message(err)) }
        );
    }

    async function remove() {
        if (
            await confirm({
                title: 'Delete this grid?',
                message: 'Its public link stops working.',
                confirmLabel: 'Delete',
                tone: 'danger'
            })
        )
            del.mutate(grid.id, { onSuccess: () => navigate('/grids', { replace: true }) });
    }

    return (
        <form className="stack" onSubmit={submit}>
            <h2>Details</h2>
            <label className="field">
                <span>Title</span>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={MAX_GRID_TITLE}
                    required
                />
            </label>
            <label className="field">
                <span>Description (optional)</span>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX_GRID_DESCRIPTION}
                    rows={2}
                />
            </label>
            <div className="row">
                <label className="field">
                    <span>Columns</span>
                    <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
                        {SIZES.map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    <span>Rows</span>
                    <select value={rows} onChange={(e) => setRows(Number(e.target.value))}>
                        {SIZES.map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                </label>
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button className="btn btn--primary" disabled={patch.isPending || !title.trim()}>
                    Save details
                </button>
                <button type="button" className="btn btn--danger" onClick={remove}>
                    <Trash2 />
                    Delete grid
                </button>
                <span className="muted" role="status">
                    {saved ? 'Saved' : ''}
                </span>
            </div>
        </form>
    );
}

function CellDialog({
    grid,
    position,
    onMove,
    onClose
}: {
    grid: GridDto;
    position: number | null;
    onMove: (position: number) => void;
    onClose: () => void;
}) {
    const ref = useModalDialog(position !== null);
    return (
        <dialog
            ref={ref}
            className="dialog dialog--fixed"
            onClose={onClose}
            aria-labelledby="cell-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {position !== null && (
                <CellEditor
                    key={position}
                    grid={grid}
                    position={position}
                    onMove={onMove}
                    onClose={onClose}
                />
            )}
        </dialog>
    );
}

function CellEditor({
    grid,
    position,
    onMove,
    onClose
}: {
    grid: GridDto;
    position: number;
    onMove: (position: number) => void;
    onClose: () => void;
}) {
    const cell = grid.cells[position]!;
    const setCell = useSetGridCell(grid.id);
    const swap = useSwapGridCells(grid.id);
    const [label, setLabel] = useState(cell.label);
    const [error, setError] = useState<string>();
    const row = Math.floor(position / grid.cols);
    const col = position % grid.cols;

    const fail = (e: unknown) => setError(message(e));
    const save = (extra: { igdbId?: number | null }) =>
        setCell.mutate(
            { position, cell: { label: label.trim(), ...extra } },
            { onSuccess: onClose, onError: fail }
        );
    const step = (to: number) =>
        swap.mutate({ a: position, b: to }, { onSuccess: () => onMove(to), onError: fail });
    // The label is part of the cell, so moving carries the unsaved text only if it was saved first
    const dirty = label.trim() !== cell.label;

    return (
        <div className="dialog__body dialog__body--fill dialog__body--cell">
            <div className="dialog__head">
                <h2 id="cell-title">
                    Cell {position + 1}
                    <span className="muted">
                        {' '}
                        · row {row + 1}, column {col + 1}
                    </span>
                </h2>
                <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
                    <X />
                </button>
            </div>
            <LabelCombobox
                label="Label"
                value={label}
                onChange={setLabel}
                suggestions={GRID_LABEL_PROMPTS}
                exclude={grid.cells.filter((c) => c.position !== position).map((c) => c.label)}
                maxLength={MAX_CELL_LABEL}
                placeholder="e.g. Best soundtrack"
            />
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button
                    className="btn btn--primary"
                    disabled={setCell.isPending || !dirty}
                    onClick={() => save({})}
                >
                    Save label
                </button>
                {cell.game && (
                    <button
                        className="btn"
                        disabled={setCell.isPending}
                        onClick={() => save({ igdbId: null })}
                    >
                        Remove {cell.game.name}
                    </button>
                )}
                <span className="grid-moves" role="group" aria-label="Move this cell">
                    <button
                        className="btn"
                        aria-label="Move up"
                        disabled={row === 0 || dirty || swap.isPending}
                        onClick={() => step(position - grid.cols)}
                    >
                        <ArrowUp />
                    </button>
                    <button
                        className="btn"
                        aria-label="Move down"
                        disabled={row === grid.rows - 1 || dirty || swap.isPending}
                        onClick={() => step(position + grid.cols)}
                    >
                        <ArrowDown />
                    </button>
                    <button
                        className="btn"
                        aria-label="Move left"
                        disabled={col === 0 || dirty || swap.isPending}
                        onClick={() => step(position - 1)}
                    >
                        <ArrowLeft />
                    </button>
                    <button
                        className="btn"
                        aria-label="Move right"
                        disabled={col === grid.cols - 1 || dirty || swap.isPending}
                        onClick={() => step(position + 1)}
                    >
                        <ArrowRight />
                    </button>
                </span>
            </div>
            <GameSearchPicker
                autoFocus={!cell.game}
                busy={setCell.isPending}
                onPick={(g: SearchResultDto) => save({ igdbId: g.igdbId })}
            />
        </div>
    );
}
