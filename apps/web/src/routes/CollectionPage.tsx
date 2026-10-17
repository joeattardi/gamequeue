import { ENTRY_SORTS, ENTRY_STATUSES, type EntryDto } from '@gamequeue/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEntries, useFacets } from '../api/collection';
import { AddGameDialog } from '../components/AddGameDialog';
import { Cover } from '../components/Cover';
import { formatMinutes, platformLabel, useDebounced, yearOf } from '../lib';

const SORT_LABELS: Record<(typeof ENTRY_SORTS)[number], string> = {
    title: 'Title',
    added: 'Recently added',
    release: 'Release date',
    rating: 'My rating',
    ttb: 'Time to beat'
};

export function CollectionPage({ view }: { view: 'all' | 'backlog' }) {
    const [params, setParams] = useSearchParams();
    const [adding, setAdding] = useState(false);
    const facets = useFacets();

    const [text, setText] = useState(params.get('q') ?? '');
    const q = useDebounced(text, 250);
    const set = (key: string, value: string) =>
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                value ? n.set(key, value) : n.delete(key);
                return n;
            },
            { replace: true }
        );
    useEffect(() => {
        if ((params.get('q') ?? '') !== q.trim()) set('q', q.trim());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    const query = new URLSearchParams(params);
    query.set('view', view);
    const entries = useEntries(query);
    const filtered = ['status', 'platform', 'genre', 'tag', 'q'].some((k) => params.get(k));

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>{view === 'backlog' ? 'Backlog' : 'Collection'}</h1>
                    <p className="muted" aria-live="polite">
                        {entries.data
                            ? `${entries.data.length} ${entries.data.length === 1 ? 'game' : 'games'}${filtered ? ' match' : ''}`
                            : ' '}
                        {view === 'backlog' && " · everything you haven't started"}
                    </p>
                </div>
                <button className="btn btn--primary" onClick={() => setAdding(true)}>
                    + Add game
                </button>
            </div>

            <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
                <label className="field field--grow">
                    <span>Search</span>
                    <input
                        type="search"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Title…"
                    />
                </label>
                {view === 'all' && (
                    <Select
                        label="Status"
                        value={params.get('status') ?? ''}
                        onChange={(v) => set('status', v)}
                        options={ENTRY_STATUSES.map((s) => [s, s[0]!.toUpperCase() + s.slice(1)])}
                    />
                )}
                <Select
                    label="Platform"
                    value={params.get('platform') ?? ''}
                    onChange={(v) => set('platform', v)}
                    options={(facets.data?.platforms ?? []).map((p) => [String(p.id), p.name])}
                />
                <Select
                    label="Genre"
                    value={params.get('genre') ?? ''}
                    onChange={(v) => set('genre', v)}
                    options={(facets.data?.genres ?? []).map((g) => [String(g.id), g.name])}
                />
                <Select
                    label="Tag"
                    value={params.get('tag') ?? ''}
                    onChange={(v) => set('tag', v)}
                    options={(facets.data?.tags ?? []).map((t) => [t, t])}
                />
                <Select
                    label="Sort by"
                    value={params.get('sort') ?? 'title'}
                    onChange={(v) => set('sort', v === 'title' ? '' : v)}
                    options={ENTRY_SORTS.map((s) => [s, SORT_LABELS[s]])}
                    all={false}
                />
                {filtered && (
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                            setText('');
                            setParams({}, { replace: true });
                        }}
                    >
                        Clear
                    </button>
                )}
            </form>

            {entries.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your games.
                </p>
            ) : entries.data?.length === 0 ? (
                <Empty view={view} filtered={filtered} onAdd={() => setAdding(true)} />
            ) : (
                <ul className="grid" aria-busy={entries.isFetching}>
                    {entries.data?.map((e) => (
                        <Card key={e.id} entry={e} />
                    ))}
                </ul>
            )}
            <AddGameDialog open={adding} onClose={() => setAdding(false)} />
        </section>
    );
}

function Select({
    label,
    value,
    onChange,
    options,
    all = true
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: [string, string][];
    all?: boolean;
}) {
    if (all && options.length === 0) return null;
    return (
        <label className="field">
            <span>{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {all && <option value="">All</option>}
                {options.map(([v, l]) => (
                    <option key={v} value={v}>
                        {l}
                    </option>
                ))}
            </select>
        </label>
    );
}

function Empty({
    view,
    filtered,
    onAdd
}: {
    view: 'all' | 'backlog';
    filtered: boolean;
    onAdd: () => void;
}) {
    return (
        <div className="empty">
            <p>
                <strong>
                    {filtered
                        ? 'Nothing matches those filters.'
                        : view === 'backlog'
                          ? 'Your backlog is empty.'
                          : 'No games yet.'}
                </strong>
            </p>
            {!filtered && (
                <button className="btn btn--primary" onClick={onAdd}>
                    Add your first game
                </button>
            )}
        </div>
    );
}

function Card({ entry }: { entry: EntryDto }) {
    const { game } = entry;
    return (
        <li className="card">
            <Link to={`/games/${entry.id}`} className="card__link">
                <Cover imageId={game.coverImageId} name={game.name} />
                <div className="card__meta">
                    <strong className="card__title">{game.name}</strong>
                    <span className="muted card__sub">
                        {[yearOf(game.releaseDate), entry.platforms.map(platformLabel).join(', ')]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                    <span className="card__chips">
                        {entry.status !== 'unplayed' && (
                            <span className={`badge badge--${entry.status}`}>{entry.status}</span>
                        )}
                        {entry.rating !== null && <span className="badge">★ {entry.rating}</span>}
                        {entry.ttbMinutes !== null && (
                            <span className="badge badge--quiet">
                                {formatMinutes(entry.ttbMinutes)}
                            </span>
                        )}
                    </span>
                </div>
            </Link>
        </li>
    );
}
