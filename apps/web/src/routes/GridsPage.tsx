import { DEFAULT_GRID_SIZE, GRID_MAX_SIZE, MAX_GRID_TITLE } from '@gamequeue/shared';
import { LayoutGrid, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useCreateGrid, useGrids } from '../api/grids';
import { ListCard } from '../components/ListCard';
import { ListCardSkeletons } from '../components/PageSkeletons';
import { useModalDialog } from '../components/useModalDialog';
import { usePageTitle } from '../lib';

const SIZES = Array.from({ length: GRID_MAX_SIZE }, (_, i) => i + 1);

export function GridsPage() {
    usePageTitle('Grids');
    const grids = useGrids();
    const [creating, setCreating] = useState(false);

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <LayoutGrid aria-hidden="true" />
                        Grids
                    </h1>
                    <p className="muted">
                        Labelled boards of games, like “Best soundtrack” or “All-time favorite”.
                        Every grid has a public link you can share.
                    </p>
                </div>
                <button className="btn btn--primary" onClick={() => setCreating(true)}>
                    <Plus />
                    New grid
                </button>
            </div>
            <NewGridDialog open={creating} onClose={() => setCreating(false)} />
            {grids.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your grids.
                </p>
            ) : grids.isPending ? (
                <ListCardSkeletons />
            ) : grids.data.length === 0 ? (
                <div className="empty">
                    <p>
                        <strong>No grids yet.</strong>
                    </p>
                    <p className="muted">
                        Make one with the New grid button, then fill each cell with a game.
                    </p>
                </div>
            ) : (
                <ul className="list-cards">
                    {grids.data.map((g) => (
                        <ListCard
                            key={g.id}
                            to={`/grids/${g.id}`}
                            name={g.title}
                            count={g.filled}
                            covers={g.covers}
                            detail={`${g.cols}×${g.rows} · ${g.filled} of ${g.cols * g.rows} filled`}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function NewGridDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useModalDialog(open);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="new-grid-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <NewGridForm onDone={onClose} />}
        </dialog>
    );
}

function NewGridForm({ onDone }: { onDone: () => void }) {
    const create = useCreateGrid();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [cols, setCols] = useState(DEFAULT_GRID_SIZE);
    const [rows, setRows] = useState(DEFAULT_GRID_SIZE);
    const [prompts, setPrompts] = useState(true);
    const [error, setError] = useState<string>();

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        create.mutate(
            { title: title.trim(), cols, rows, prompts },
            {
                onSuccess: (grid) => navigate(`/grids/${grid.id}`),
                onError: (err) =>
                    setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
            }
        );
    }

    return (
        <form className="dialog__body stack" onSubmit={submit}>
            <div className="dialog__head">
                <h2 id="new-grid-title">New grid</h2>
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={onDone}
                    aria-label="Close"
                >
                    <X />
                </button>
            </div>
            <label className="field">
                <span>Title</span>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={MAX_GRID_TITLE}
                    required
                    autoFocus
                    data-autofocus
                    placeholder="e.g. My game year 2026"
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
            <label className="check">
                <input
                    type="checkbox"
                    checked={prompts}
                    onChange={(e) => setPrompts(e.target.checked)}
                />
                <span>Start with suggested labels (you can rename every one)</span>
            </label>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button type="button" className="btn" onClick={onDone}>
                    Cancel
                </button>
                <button className="btn btn--primary" disabled={create.isPending || !title.trim()}>
                    Create grid
                </button>
            </div>
        </form>
    );
}
