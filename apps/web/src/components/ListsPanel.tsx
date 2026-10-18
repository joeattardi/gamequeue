import type { EntryDto } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAddToQueue, useRemoveFromQueue } from '../api/queue';
import { CheckSkeletons } from './PageSkeletons';
import { useAddToList, useCreateList, useLists, useRemoveFromList } from '../api/lists';

/** Which lists a game is on, with quick add/remove and a way to start a new list. */
export function ListsPanel({ entry }: { entry: EntryDto }) {
    const lists = useLists();
    const add = useAddToList();
    const remove = useRemoveFromList();
    const create = useCreateList();
    const enqueue = useAddToQueue();
    const dequeue = useRemoveFromQueue();
    const [name, setName] = useState('');
    const [error, setError] = useState<string>();
    const member = new Set(entry.lists.map((l) => l.id));
    const fail = (e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');

    function toggleList(listId: number) {
        setError(undefined);
        const vars = { listId, entryId: entry.id };
        if (member.has(listId)) remove.mutate(vars, { onError: fail });
        else add.mutate(vars, { onError: fail });
    }

    function toggleQueue() {
        setError(undefined);
        const m = entry.queued ? dequeue : enqueue;
        m.mutate(entry.id, { onError: fail });
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        create.mutate(name.trim(), {
            onSuccess: (list) => {
                setName('');
                add.mutate({ listId: list.id, entryId: entry.id }, { onError: fail });
            },
            onError: fail
        });
    }

    return (
        <section aria-labelledby="lists-h" className="panel">
            <h2 id="lists-h">Queue &amp; lists</h2>
            <label className="check">
                <input type="checkbox" checked={entry.queued} onChange={toggleQueue} />
                On my <Link to="/queue">queue</Link>
            </label>
            {lists.isPending ? (
                <CheckSkeletons label="Loading your lists" />
            ) : lists.data?.length ? (
                <fieldset className="checks">
                    <legend className="sr-only">Lists this game is on</legend>
                    {lists.data.map((l) => (
                        <label key={l.id} className="check">
                            <input
                                type="checkbox"
                                checked={member.has(l.id)}
                                onChange={() => toggleList(l.id)}
                            />
                            {l.name}
                        </label>
                    ))}
                </fieldset>
            ) : (
                <p className="muted">
                    No other lists yet. Make one below, or see <Link to="/lists">all lists</Link>.
                </p>
            )}
            <form className="inline-form" onSubmit={submit}>
                <label className="field">
                    <span>New list with this game</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        placeholder="e.g. Cozy games"
                    />
                </label>
                <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
                    Create
                </button>
            </form>
            <p className="form-error" role="alert">
                {error}
            </p>
        </section>
    );
}
