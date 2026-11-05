import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import { ArrowUpLeft, Clock, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMe } from '../api/auth';
import { useEntries, useFacets } from '../api/collection';
import { useNavCounts } from '../api/counts';
import { useQueue } from '../api/queue';
import { useUnifiedSearch } from '../api/search';
import { ApiRequestError } from '../api/client';
import { Cover } from '../components/Cover';
import { useSearch } from '../components/SearchContext';
import { AddButton, IgdbRowContent, LibraryRowContent } from '../components/SearchRows';
import { QuickAddSheet } from '../components/QuickAddSheet';
import { EntryStatusChip } from '../components/StatusChip';
import { useAddedGames } from '../components/useAddedGames';
import { useDebounced, useMediaQuery, usePageTitle } from '../lib';
import { useRecentSearches } from '../recentSearches';
import {
    MIN_QUERY,
    buildResults,
    igdbRowState,
    normalizeQuery,
    platformScope,
    type SearchScope
} from '../searchModel';

const PLAYING = new URLSearchParams({ status: 'playing', sort: 'added', dir: 'desc' });

/**
 * Phones: the search page, in three states. Landing (title, big field, recent searches, jump back
 * in), results (the field with Cancel, scope chips, two groups of 80px rows that scroll on their own
 * above the keyboard) and the quick-add sheet. On larger screens search is the ⌘K palette, so this
 * route just opens that.
 */
export function SearchPage() {
    const phone = useMediaQuery('(max-width: 767px)');
    const navigate = useNavigate();
    const { openSearch } = useSearch();
    const [params] = useSearchParams();
    const initial = params.get('q') ?? '';
    useEffect(() => {
        if (phone) return;
        openSearch(initial);
        navigate('/', { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phone]);
    usePageTitle('Search');
    return phone ? <PhoneSearch /> : null;
}

function PhoneSearch() {
    const me = useMe().data!;
    const [params, setParams] = useSearchParams();
    const [text, setText] = useState(params.get('q') ?? '');
    const [focused, setFocused] = useState(false);
    const [scope, setScope] = useState<SearchScope>('all');
    const [sheet, setSheet] = useState<SearchResultDto | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const page = useRef<HTMLDivElement>(null);
    const recent = useRecentSearches(me.id);
    const { added, add } = useAddedGames();
    const counts = useNavCounts();
    const facets = useFacets();

    const typed = normalizeQuery(text);
    const active = focused || typed.length > 0;
    const search = useUnifiedSearch(useDebounced(text, 250));
    const searching = typed.length >= MIN_QUERY;
    const results = useMemo(
        () =>
            buildResults({
                query: search.q,
                entries: search.entries,
                igdb: search.igdbResults,
                scope,
                added
            }),
        [search.q, search.entries, search.igdbResults, scope, added]
    );

    // The query stays in the address, so Back from a game returns to these results
    useEffect(() => {
        setParams(typed ? { q: typed } : {}, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typed]);

    // Size the screen to what the keyboard leaves: the visual viewport shrinks, the layout one doesn't
    useEffect(() => {
        const vv = window.visualViewport;
        const el = page.current;
        if (!vv || !el || !active) return;
        const fit = () => {
            el.style.height = `${vv.height}px`;
            el.style.transform = `translateY(${vv.offsetTop}px)`;
        };
        fit();
        vv.addEventListener('resize', fit);
        vv.addEventListener('scroll', fit);
        return () => {
            vv.removeEventListener('resize', fit);
            vv.removeEventListener('scroll', fit);
            el.style.height = '';
            el.style.transform = '';
        };
    }, [active]);

    const cancel = () => {
        setText('');
        setScope('all');
        input.current?.blur();
        setFocused(false);
    };
    const loadingLibrary = searching && (!search.enabled || search.libraryLoading);
    const loadingIgdb = searching && (!search.enabled || search.igdbLoading);
    const empty =
        searching &&
        !loadingLibrary &&
        !loadingIgdb &&
        results.library.length === 0 &&
        results.add.length === 0;
    const remember = () => recent.add(typed);

    return (
        <div
            ref={page}
            className={active ? 'search-page search-page--active' : 'search-page'}
            data-searching={searching || undefined}
        >
            {!active && (
                <div className="search-page__head">
                    <h1>Search</h1>
                    {counts.collection !== undefined && (
                        <p className="muted">
                            {counts.collection.toLocaleString()} in your library
                        </p>
                    )}
                </div>
            )}
            <div className="search-page__bar" role="search">
                <label className="search-field">
                    <Search aria-hidden="true" />
                    <span className="sr-only">Search your library and IGDB</span>
                    <input
                        ref={input}
                        type="search"
                        enterKeyHint="search"
                        placeholder="Your library and IGDB"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onKeyDown={(e) => e.key === 'Enter' && (remember(), input.current?.blur())}
                    />
                    {text && (
                        <button
                            type="button"
                            className="search-field__clear"
                            aria-label="Clear search"
                            // Keep the keyboard open: stop the field losing focus first
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                setText('');
                                input.current?.focus();
                            }}
                        >
                            <X aria-hidden="true" />
                        </button>
                    )}
                </label>
                {active && (
                    <button type="button" className="search-page__cancel" onClick={cancel}>
                        Cancel
                    </button>
                )}
            </div>

            {searching && (
                <div className="chip-row" role="group" aria-label="Show">
                    <ScopeChip
                        current={scope}
                        value="all"
                        onPick={setScope}
                        count={results.counts.all}
                    >
                        All
                    </ScopeChip>
                    <ScopeChip
                        current={scope}
                        value="library"
                        onPick={setScope}
                        count={results.counts.library}
                    >
                        In library
                    </ScopeChip>
                    <ScopeChip
                        current={scope}
                        value="new"
                        onPick={setScope}
                        count={results.counts.add}
                    >
                        Add new
                    </ScopeChip>
                    {(facets.data?.platforms ?? []).map((p) => (
                        <ScopeChip
                            key={p.id}
                            current={scope}
                            value={platformScope(p.id)}
                            onPick={setScope}
                        >
                            {p.abbreviation ?? p.name}
                        </ScopeChip>
                    ))}
                </div>
            )}

            <div
                className="search-page__body"
                onScroll={() => input.current?.blur()}
                onTouchMove={() => input.current?.blur()}
            >
                {!searching ? (
                    <>
                        {typed.length > 0 && (
                            <p className="muted search-page__hint">
                                Type at least {MIN_QUERY} characters.
                            </p>
                        )}
                        <RecentSearches
                            recent={recent.recent}
                            onClear={recent.clear}
                            onFill={(q, keepFocus) => {
                                setText(q);
                                if (keepFocus) input.current?.focus();
                                else input.current?.blur();
                            }}
                        />
                        {typed.length === 0 && <JumpBackIn />}
                    </>
                ) : (
                    <div className="search-results" aria-busy={loadingLibrary || loadingIgdb}>
                        {(results.library.length > 0 || loadingLibrary) && scope !== 'new' && (
                            <section aria-labelledby="g-library">
                                <h2 className="search-group" id="g-library">
                                    In your library
                                </h2>
                                {loadingLibrary ? (
                                    <RowSkeletons label="Searching your library" />
                                ) : (
                                    <ul className="srows">
                                        {results.library.map((e) => (
                                            <li key={e.id}>
                                                <Link
                                                    to={`/games/${e.id}`}
                                                    className="srow"
                                                    onClick={remember}
                                                >
                                                    <LibraryRowContent entry={e} query={search.q} />
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}
                        {(results.add.length > 0 || loadingIgdb || search.igdbError) &&
                            scope !== 'library' && (
                                <section aria-labelledby="g-igdb">
                                    <h2 className="search-group" id="g-igdb">
                                        Add from IGDB
                                    </h2>
                                    {loadingIgdb ? (
                                        <RowSkeletons label="Searching IGDB" />
                                    ) : search.igdbError ? (
                                        <p className="muted" role="alert">
                                            IGDB search isn't available right now.
                                            {search.igdbError instanceof ApiRequestError
                                                ? ` ${search.igdbError.message}`
                                                : ''}
                                        </p>
                                    ) : (
                                        <ul className="srows">
                                            {results.add.map((r) => (
                                                <li key={r.igdbId}>
                                                    <IgdbRow
                                                        result={r}
                                                        query={search.q}
                                                        added={added}
                                                        onOpen={remember}
                                                        onAdd={() => setSheet(r)}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            )}
                        {empty && (
                            <p className="search-empty">
                                No games found for “{typed}”.
                                <span className="muted">
                                    {' '}
                                    Try fewer words, or check the spelling.
                                </span>
                            </p>
                        )}
                    </div>
                )}
            </div>

            <QuickAddSheet
                result={sheet}
                wishlisted={sheet?.wishlisted ?? false}
                onClose={() => setSheet(null)}
                onAdd={async (input) => {
                    const r = await add(input);
                    remember();
                    return r;
                }}
            />
        </div>
    );
}

function ScopeChip({
    current,
    value,
    count,
    onPick,
    children
}: {
    current: SearchScope;
    value: SearchScope;
    count?: number;
    onPick: (s: SearchScope) => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className="chip-row__chip"
            aria-pressed={current === value}
            onClick={() => onPick(value)}
        >
            {children}
            {count !== undefined && <span className="chip-row__count">{count}</span>}
        </button>
    );
}

/** An IGDB result: a button that opens the sheet, or a link when the game is already somewhere. */
function IgdbRow({
    result,
    query,
    added,
    onOpen,
    onAdd
}: {
    result: SearchResultDto;
    query: string;
    added: ReturnType<typeof useAddedGames>['added'];
    onOpen: () => void;
    onAdd: () => void;
}) {
    const state = igdbRowState(result, added);
    const content = <IgdbRowContent result={result} query={query} added={added} />;
    if (state.kind === 'owned' || (state.kind === 'added' && state.entryId !== null))
        return (
            <Link to={`/games/${state.entryId}`} className="srow" onClick={onOpen}>
                {content}
            </Link>
        );
    if (state.kind === 'added')
        return (
            <Link to={`/games/igdb/${result.igdbId}`} className="srow" onClick={onOpen}>
                {content}
            </Link>
        );
    return (
        <div className="srow srow--action">
            <button type="button" className="srow__hit" aria-haspopup="dialog" onClick={onAdd}>
                {content}
            </button>
            {state.kind === 'add' && <AddButton name={result.name} onClick={onAdd} />}
        </div>
    );
}

function RowSkeletons({ label }: { label: string }) {
    return (
        <div className="srows" role="status" aria-label={label}>
            {[0, 1].map((i) => (
                <div key={i} className="srow srow--skeleton" aria-hidden="true">
                    <span className="skeleton srow__cover" />
                    <span className="srow__text">
                        <span className="skeleton skeleton--line" style={{ width: '60%' }} />
                        <span className="skeleton skeleton--line" style={{ width: '35%' }} />
                    </span>
                </div>
            ))}
        </div>
    );
}

function RecentSearches({
    recent,
    onClear,
    onFill
}: {
    recent: string[];
    onClear: () => void;
    onFill: (q: string, keepFocus: boolean) => void;
}) {
    if (recent.length === 0) return null;
    return (
        <section aria-labelledby="g-recent" className="recent">
            <div className="recent__head">
                <h2 className="search-group" id="g-recent">
                    Recent
                </h2>
                <button type="button" className="recent__clear" onClick={onClear}>
                    Clear
                </button>
            </div>
            <ul className="recent__list">
                {recent.map((q) => (
                    <li key={q}>
                        <button
                            type="button"
                            className="recent__item"
                            onClick={() => onFill(q, false)}
                        >
                            <Clock aria-hidden="true" />
                            <span>{q}</span>
                        </button>
                        <button
                            type="button"
                            className="recent__fill"
                            aria-label={`Put “${q}” in the search field`}
                            // Keep the field focused so the keyboard stays up
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onFill(q, true)}
                        >
                            <ArrowUpLeft aria-hidden="true" />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Covers of what you are playing and the top of your queue: the games you most likely want next. */
function JumpBackIn() {
    const playing = useEntries(PLAYING, 6);
    const queue = useQueue(4);
    const pending = playing.isPending || queue.isPending;
    const queued = queue.items.flatMap((i) => (i.entry ? [i.entry] : []));
    const entries: EntryDto[] = [...(playing.data?.entries ?? []), ...queued].filter(
        (e, i, all) => all.findIndex((x) => x.id === e.id) === i
    );
    if (!pending && entries.length === 0) return null;
    return (
        <section aria-labelledby="g-jump" className="jump">
            <h2 className="search-group" id="g-jump">
                Jump back in
            </h2>
            {pending ? (
                <div className="jump__row" role="status" aria-label="Loading your games">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="skeleton jump__skeleton" aria-hidden="true" />
                    ))}
                </div>
            ) : (
                <ul className="jump__row">
                    {entries.map((e) => (
                        <li key={e.id}>
                            <Link to={`/games/${e.id}`} className="jump__item">
                                <span className="jump__cover">
                                    <Cover imageId={e.game.coverImageId} name={e.game.name} />
                                </span>
                                <span className="jump__name">{e.game.name}</span>
                                <EntryStatusChip entry={e} />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
