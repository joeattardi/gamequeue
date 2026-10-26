import { ENTRY_SORTS } from '@gamequeue/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useFacetCounts, usePagedEntries } from '../api/collection';
import { AddGameDialog } from '../components/AddGameDialog';
import { FACET_KEYS, FacetSidebar, type FacetKey } from '../components/FacetSidebar';
import { CountBadge } from '../components/CountBadge';
import { GridSkeletons } from '../components/GridSkeletons';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { LoadMore } from '../components/LoadMore';
import { GameCard } from '../components/GameCard';
import { GameRow } from '../components/GameRow';
import { useDebounced, useMediaQuery, usePageTitle } from '../lib';
import { Filter, Library, ListTodo, Plus } from 'lucide-react';

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
    const [layout, setLayout] = useLayout(LAYOUT_KEY);
    // Under 900px the filter panel (with the sort) hides behind an icon button next to the search
    const [filtersOpen, setFiltersOpen] = useState(false);
    // The same breakpoint at which the search row turns into the compact phone layout
    const compact = useMediaQuery('(max-width: 899px)');

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

    const selected = (key: FacetKey) => params.getAll(key);
    const toggle = (key: FacetKey, value: string) =>
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                const values = n.getAll(key);
                n.delete(key);
                (values.includes(value)
                    ? values.filter((v) => v !== value)
                    : [...values, value]
                ).forEach((v) => n.append(key, v));
                return n;
            },
            { replace: true }
        );
    const clearFacets = () =>
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                FACET_KEYS.forEach((k) => n.delete(k));
                return n;
            },
            { replace: true }
        );

    const query = new URLSearchParams(params);
    query.set('view', view);
    const entries = usePagedEntries(query);
    const facets = useFacetCounts(query);
    const filtered = [...FACET_KEYS, 'q'].some((k) => params.get(k));
    const activeFacets = FACET_KEYS.reduce((n, k) => n + params.getAll(k).length, 0);

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
                        <CountBadge total={entries.total} filtered={filtered} />
                    </h1>
                    {view === 'backlog' && <p className="muted">Everything you haven't started</p>}
                </div>
                <div className="page-head__tools">
                    <LayoutToggle layout={layout} onChange={setLayout} />
                    <button
                        className="btn btn--primary page-head__add"
                        onClick={() => setAdding(true)}
                    >
                        <Plus />
                        Add game
                    </button>
                </div>
            </div>

            <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
                <label className="field field--grow">
                    <span>Search</span>
                    <input
                        type="search"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={compact ? 'Search games…' : 'Title…'}
                    />
                </label>
                <label className="field filters__sort">
                    <span>Sort by</span>
                    <select
                        value={params.get('sort') ?? 'title'}
                        onChange={(e) =>
                            set('sort', e.target.value === 'title' ? '' : e.target.value)
                        }
                    >
                        {ENTRY_SORTS.map((s) => (
                            <option key={s} value={s}>
                                {SORT_LABELS[s]}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="bar-btn bar-btn--narrow"
                    aria-label="Filters and sort"
                    aria-expanded={filtersOpen}
                    aria-controls="collection-facets"
                    onClick={() => setFiltersOpen((o) => !o)}
                >
                    <Filter />
                    {activeFacets > 0 && <span className="bar-btn__count">{activeFacets}</span>}
                </button>
                <button
                    type="button"
                    className="bar-btn bar-btn--narrow"
                    aria-label="Add game"
                    onClick={() => setAdding(true)}
                >
                    <Plus />
                </button>
            </form>

            <div className="browse">
                <div className="browse__main">
                    {entries.isError ? (
                        <p className="form-error" role="alert">
                            Couldn't load your games.
                        </p>
                    ) : entries.isPending ? (
                        <GridSkeletons layout={layout} />
                    ) : entries.total === 0 ? (
                        <Empty view={view} filtered={filtered} onAdd={() => setAdding(true)} />
                    ) : (
                        <>
                            {layout === 'list' ? (
                                <ul className="game-rows" aria-busy={entries.isFetching}>
                                    {entries.items.map((e) => (
                                        <GameRow key={e.id} entry={e} />
                                    ))}
                                </ul>
                            ) : (
                                <ul className="grid" aria-busy={entries.isFetching}>
                                    {entries.items.map((e) => (
                                        <GameCard key={e.id} entry={e} />
                                    ))}
                                </ul>
                            )}
                            <LoadMore
                                shown={entries.items.length}
                                total={entries.total}
                                hasMore={entries.hasNextPage}
                                loading={entries.isFetchingNextPage}
                                failed={entries.isFetchNextPageError}
                                onMore={() => entries.fetchNextPage()}
                                skeleton={<GridSkeletons layout={layout} count={4} />}
                            />
                        </>
                    )}
                </div>
                <aside className="browse__side" aria-label="Filters">
                    <FacetSidebar
                        facets={facets.data}
                        selected={selected}
                        onToggle={toggle}
                        onClear={clearFacets}
                        showStatus={view === 'all'}
                        open={filtersOpen}
                        sort={
                            <label className="field">
                                <span>Sort by</span>
                                <select
                                    value={params.get('sort') ?? 'title'}
                                    onChange={(e) =>
                                        set(
                                            'sort',
                                            e.target.value === 'title' ? '' : e.target.value
                                        )
                                    }
                                >
                                    {ENTRY_SORTS.map((s) => (
                                        <option key={s} value={s}>
                                            {SORT_LABELS[s]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        }
                    />
                </aside>
            </div>
            <AddGameDialog open={adding} onClose={() => setAdding(false)} />
        </section>
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
