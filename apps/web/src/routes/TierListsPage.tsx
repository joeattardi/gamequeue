import { MAX_TIER_LIST_DESCRIPTION, MAX_TIER_LIST_TITLE } from '@gamequeue/shared';
import { Plus, Rows3, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useCreateTierList, useTierLists } from '../api/tiers';
import { ListCard } from '../components/ListCard';
import { ListCardSkeletons } from '../components/PageSkeletons';
import { useModalDialog } from '../components/useModalDialog';
import { usePageTitle } from '../lib';

export function TierListsPage() {
    usePageTitle('Tier lists');
    const lists = useTierLists();
    const [creating, setCreating] = useState(false);

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Rows3 aria-hidden="true" />
                        Tier lists
                    </h1>
                    <p className="muted">
                        Rank games into tiers, from S down to F, and share the result. Every tier
                        list has a public link.
                    </p>
                </div>
                <button className="btn btn--primary" onClick={() => setCreating(true)}>
                    <Plus />
                    New tier list
                </button>
            </div>
            <NewTierListDialog open={creating} onClose={() => setCreating(false)} />
            {lists.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your tier lists.
                </p>
            ) : lists.isPending ? (
                <ListCardSkeletons />
            ) : lists.data.length === 0 ? (
                <div className="empty">
                    <p>
                        <strong>No tier lists yet.</strong>
                    </p>
                    <p className="muted">
                        Make one with the New tier list button, then add games and sort them into
                        tiers.
                    </p>
                </div>
            ) : (
                <ul className="list-cards">
                    {lists.data.map((l) => (
                        <ListCard
                            key={l.id}
                            to={`/tiers/${l.id}`}
                            name={l.title}
                            count={l.ranked}
                            covers={l.covers}
                            detail={`${l.ranked} ranked`}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function NewTierListDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useModalDialog(open);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="new-tiers-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <NewTierListForm onDone={onClose} />}
        </dialog>
    );
}

function NewTierListForm({ onDone }: { onDone: () => void }) {
    const create = useCreateTierList();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string>();

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        create.mutate(
            { title: title.trim(), description: description.trim() },
            {
                onSuccess: (list) => navigate(`/tiers/${list.id}`),
                onError: (err) =>
                    setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
            }
        );
    }

    return (
        <form className="dialog__body stack" onSubmit={submit}>
            <div className="dialog__head">
                <h2 id="new-tiers-title">New tier list</h2>
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
                    maxLength={MAX_TIER_LIST_TITLE}
                    required
                    autoFocus
                    data-autofocus
                    placeholder="e.g. Every Zelda game, ranked"
                />
            </label>
            <label className="field">
                <span>Description (optional)</span>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={MAX_TIER_LIST_DESCRIPTION}
                    rows={2}
                />
            </label>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button type="button" className="btn" onClick={onDone}>
                    Cancel
                </button>
                <button className="btn btn--primary" disabled={create.isPending || !title.trim()}>
                    Create tier list
                </button>
            </div>
        </form>
    );
}
