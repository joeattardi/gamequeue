import { ListCard } from '../components/ListCard';
import { ListCardSkeletons } from '../components/PageSkeletons';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError } from '../api/client';
import { SMART_LIST_PRESETS, type SmartListSummaryDto } from '@gamequeue/shared';
import { useCreateList, useLists } from '../api/lists';
import { useCreateSmartList, useSmartLists } from '../api/smartLists';
import { List, Plus, WandSparkles } from 'lucide-react';
import { usePageTitle } from '../lib';

export function ListsPage() {
    usePageTitle('Lists');
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
                    <h1>
                        <List aria-hidden="true" />
                        Lists
                    </h1>
                    <p className="muted">
                        Ordered lists of games, and smart lists that fill themselves. Your queue has
                        its own page.
                    </p>
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
                    <Plus />
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
            ) : lists.isPending ? (
                <ListCardSkeletons />
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
                        <ListCard
                            key={l.id}
                            to={`/lists/${l.id}`}
                            name={l.name}
                            count={l.count}
                            covers={l.covers}
                        />
                    ))}
                </ul>
            )}

            <SmartLists />
        </section>
    );
}

function SmartLists() {
    const smart = useSmartLists();
    const create = useCreateSmartList();
    const [error, setError] = useState<string>();
    // Presets you've already added (by name) aren't offered again
    const have = new Set((smart.data ?? []).map((l) => l.name.toLowerCase()));
    const suggestions = SMART_LIST_PRESETS.filter((p) => !have.has(p.name.toLowerCase()));

    return (
        <section aria-labelledby="smart-h" className="smart-lists">
            <div className="page-head">
                <div>
                    <h2 id="smart-h">
                        <WandSparkles aria-hidden="true" />
                        Smart lists
                    </h2>
                    <p className="muted">
                        Describe the games you want and the list fills itself, staying current as
                        your collection changes.
                    </p>
                </div>
                <Link className="btn btn--primary" to="/smart-lists/new">
                    <Plus />
                    New smart list
                </Link>
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
            {smart.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your smart lists.
                </p>
            ) : smart.isPending ? (
                <ListCardSkeletons count={2} />
            ) : (
                smart.data.length > 0 && <SmartCards lists={smart.data} />
            )}
            {smart.data && suggestions.length > 0 && (
                <div className="panel suggestions">
                    <h3>
                        {smart.data.length === 0 ? 'Start with a suggestion' : 'More suggestions'}
                    </h3>
                    <ul className="suggestions__list">
                        {suggestions.map((p) => (
                            <li key={p.key}>
                                <span>
                                    <strong>{p.name}</strong>
                                    <span className="muted"> {p.blurb}</span>
                                </span>
                                <button
                                    className="btn"
                                    disabled={create.isPending}
                                    aria-label={`Add the ${p.name} smart list`}
                                    onClick={() => {
                                        setError(undefined);
                                        create.mutate(
                                            {
                                                name: p.name,
                                                rules: p.rules,
                                                sort: p.sort,
                                                dir: p.dir
                                            },
                                            {
                                                onError: (err) =>
                                                    setError(
                                                        err instanceof ApiRequestError
                                                            ? err.message
                                                            : 'Something went wrong.'
                                                    )
                                            }
                                        );
                                    }}
                                >
                                    <Plus />
                                    Add
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="muted">You can change the rules after adding one.</p>
                </div>
            )}
        </section>
    );
}

function SmartCards({ lists }: { lists: SmartListSummaryDto[] }) {
    return (
        <ul className="list-cards">
            {lists.map((l) => (
                <ListCard
                    key={l.id}
                    to={`/smart-lists/${l.id}`}
                    name={l.name}
                    count={l.count}
                    covers={l.covers}
                />
            ))}
        </ul>
    );
}
