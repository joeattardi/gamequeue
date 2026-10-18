import { ENTRY_SORTS, ENTRY_STATUSES, type EntryDto } from '@gamequeue/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEntries, useFacets } from '../api/collection';
import { AddGameDialog } from '../components/AddGameDialog';
import { Cover } from '../components/Cover';
import { GridSkeletons } from '../components/GridSkeletons';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { EntryChips, EntrySub, GameCard } from '../components/GameCard';
import { useDebounced, usePageTitle } from '../lib';
import { Library, ListTodo, Plus } from 'lucide-react';

const SORT_LABELS: Record<(typeof ENTRY_SORTS)[number], string> = {
    title: 'Title',
    added: 'Recently added',
    release: 'Release date',
    rating: 'My rating',
    ttb: 'Time to beat'
};

const LAYOUT_KEY = 'gq_collection_layout';

export function CollectionPage({ view }: { view: 'all' | 'backlog' }) {
    const [params, setParams] = useSearchParams();
    usePageTitle(view === 'backlog' ? 'Backlog' : 'Collection');
    const [adding, setAdding] = useState(false);
    const facets = useFacets();
    const [layout, setLayout] = useLayout(LAYOUT_KEY);

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
                    <h1>
                        {view === 'backlog' ? (
                            <ListTodo aria-hidden="true" />
                        ) : (
                            <Library aria-hidden="true" />
                        )}
                        {view === 'backlog' ? 'Backlog' : 'Collection'}
                    </h1>
                    <p className="muted" aria-live="polite">
                        {entries.data
                            ? `${entries.data.length} ${entries.data.length === 1 ? 'game' : 'games'}${filtered ? ' match' : ''}`
                            : ' '}
                        {view === 'backlog' && " · everything you haven't started"}
                    </p>
                </div>
                <button className="btn btn--primary" onClick={() => setAdding(true)}>
                    <Plus />
                    Add game
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

            <LayoutToggle layout={layout} onChange={setLayout} />

            {entries.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your games.
                </p>
            ) : entries.isPending ? (
                <GridSkeletons layout={layout} />
            ) : entries.data?.length === 0 ? (
                <Empty view={view} filtered={filtered} onAdd={() => setAdding(true)} />
            ) : layout === 'list' ? (
                <ul className="game-rows" aria-busy={entries.isFetching}>
                    {entries.data?.map((e) => (
                        <Row key={e.id} entry={e} />
                    ))}
                </ul>
            ) : (
                <ul className="grid" aria-busy={entries.isFetching}>
                    {entries.data?.map((e) => (
                        <GameCard key={e.id} entry={e} />
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
                    <Plus />
                    Add your first game
                </button>
            )}
        </div>
    );
}

function Row({ entry }: { entry: EntryDto }) {
    const { game } = entry;
    return (
        <li>
            <Link to={`/games/${entry.id}`} className="game-row">
                <Cover imageId={game.coverImageId} name={game.name} size="cover_small" />
                <span className="game-row__text">
                    <strong className="card__title">{game.name}</strong>
                    <EntrySub entry={entry} />
                </span>
                <EntryChips entry={entry} />
            </Link>
        </li>
    );
}
