import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useCreateList, useLists } from '../api/lists';

export function ListsPage() {
    const lists = useLists();
    const create = useCreateList();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [error, setError] = useState<string>();

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        create.mutate(name.trim(), {
            onSuccess: (list) => navigate(`/lists/${list.id}`),
            onError: (err) =>
                setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
        });
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>Lists</h1>
                    <p className="muted">Ordered lists of games. Your queue has its own page.</p>
                </div>
            </div>
            <form className="inline-form" onSubmit={submit}>
                <label className="field field--grow">
                    <span>New list</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        placeholder="e.g. Up next"
                    />
                </label>
                <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={create.isPending || !name.trim()}
                >
                    Create list
                </button>
            </form>
            <p className="form-error" role="alert">
                {error}
            </p>
            {lists.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your lists.
                </p>
            ) : lists.data?.length === 0 ? (
                <div className="empty">
                    <p>
                        <strong>No lists yet.</strong>
                    </p>
                    <p className="muted">
                        Create one above, then add games from here or from a game's page.
                    </p>
                </div>
            ) : (
                <ul className="list-cards">
                    {lists.data?.map((l) => (
                        <li key={l.id}>
                            <Link to={`/lists/${l.id}`} className="list-card">
                                <strong>{l.name}</strong>
                                <span className="muted">
                                    {l.count} {l.count === 1 ? 'game' : 'games'}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
