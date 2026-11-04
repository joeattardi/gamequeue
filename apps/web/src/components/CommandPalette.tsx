import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import { ArrowRight, Clock, ListPlus, Play, Plus, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiRequestError } from '../api/client';
import { useInvalidateCollection } from '../api/collection';
import { useAddToQueue } from '../api/queue';
import { useRecentPlatformIds, useUnifiedSearch } from '../api/search';
import { todayLocal, useDebounced } from '../lib';
import { useRecentSearches } from '../recentSearches';
import {
    MIN_QUERY,
    buildResults,
    defaultPlatformIds,
    igdbRowState,
    normalizeQuery
} from '../searchModel';
import { IgdbRowContent, LibraryRowContent } from './SearchRows';
import { useToast } from './Toast';
import { useAddedGames } from './useAddedGames';
import { useModalDialog } from './useModalDialog';

const JUMPS = [
    ['/', 'Now playing'],
    ['/queue', 'Queue'],
    ['/collection', 'Collection'],
    ['/backlog', 'Backlog'],
    ['/wishlist', 'Wishlist'],
    ['/lists', 'Lists'],
    ['/pick', 'Pick for me'],
    ['/discover', 'Discover'],
    ['/stats', 'Stats'],
    ['/recap', 'Save File'],
    ['/account', 'Account'],
    ['/data', 'Data']
] as const;

const PER_GROUP = 5;
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

type ActionKind = 'start' | 'resume' | 'queue';

type Item =
    | { kind: 'library'; id: string; entry: EntryDto }
    | { kind: 'action'; id: string; entry: EntryDto; action: ActionKind }
    | { kind: 'igdb'; id: string; result: SearchResultDto }
    | { kind: 'recent'; id: string; q: string }
    | { kind: 'jump'; id: string; to: string; label: string };

interface Group {
    label: string;
    items: Item[];
}

/** What can be done to a library game from the palette, given where it stands. */
function actionsFor(entry: EntryDto): ActionKind[] {
    const out: ActionKind[] = [];
    if (entry.status === 'paused') out.push('resume');
    else if (entry.status !== 'playing') out.push('start');
    if (!entry.queued) out.push('queue');
    return out;
}

/**
 * ⌘K / "/" search and jump: your library, quick actions for the highlighted game, and IGDB, in one
 * list you can drive from the keyboard. Adding an IGDB result (Tab) never leaves the page.
 */
export function CommandPalette({
    open,
    initialQuery,
    userId,
    onClose
}: {
    open: boolean;
    initialQuery: string;
    userId: number;
    onClose: () => void;
}) {
    const ref = useModalDialog(open);
    return (
        <dialog
            ref={ref}
            className="palette"
            aria-label="Search or jump to"
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <PaletteBody initialQuery={initialQuery} userId={userId} onClose={onClose} />}
        </dialog>
    );
}

function PaletteBody({
    initialQuery,
    userId,
    onClose
}: {
    initialQuery: string;
    userId: number;
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const toast = useToast();
    const invalidate = useInvalidateCollection();
    const addToQueue = useAddToQueue();
    const listId = useId();
    const [text, setText] = useState(initialQuery);
    const [activeId, setActiveId] = useState<string | null>(null);
    const recentSearches = useRecentSearches(userId);
    const recentPlatforms = useRecentPlatformIds();
    const { added, add, undo } = useAddedGames({ toast: false });

    const search = useUnifiedSearch(useDebounced(text, 200));
    const typed = normalizeQuery(text);
    const results = useMemo(
        () =>
            buildResults({
                query: search.q,
                entries: search.entries,
                igdb: search.igdbResults,
                scope: 'all',
                added
            }),
        [search.q, search.entries, search.igdbResults, added]
    );
    const searching = typed.length >= MIN_QUERY;
    const library = searching ? results.library.slice(0, PER_GROUP) : [];
    const igdb = searching ? results.add.slice(0, PER_GROUP) : [];

    // Actions apply to the highlighted library game, or the first match
    const targetEntry =
        library.find((e) => activeId === `lib:${e.id}` || activeId?.startsWith(`act:${e.id}:`)) ??
        library[0];

    const groups: Group[] = useMemo(() => {
        const g: Group[] = [];
        if (!searching) {
            if (typed.length === 0 && recentSearches.recent.length)
                g.push({
                    label: 'Recent',
                    items: recentSearches.recent.map((q) => ({ kind: 'recent', id: `rec:${q}`, q }))
                });
            const jumps = JUMPS.filter(([, label]) =>
                label.toLowerCase().includes(typed.toLowerCase())
            ).slice(0, typed ? PER_GROUP : 6);
            if (jumps.length)
                g.push({
                    label: 'Jump to',
                    items: jumps.map(([to, label]) => ({
                        kind: 'jump',
                        id: `jump:${to}`,
                        to,
                        label
                    }))
                });
            return g;
        }
        if (library.length)
            g.push({
                label: 'In your library',
                items: library.map((entry) => ({ kind: 'library', id: `lib:${entry.id}`, entry }))
            });
        if (targetEntry && actionsFor(targetEntry).length)
            g.push({
                label: 'Actions',
                items: actionsFor(targetEntry).map((action) => ({
                    kind: 'action',
                    id: `act:${targetEntry.id}:${action}`,
                    entry: targetEntry,
                    action
                }))
            });
        if (igdb.length)
            g.push({
                label: 'Add from IGDB',
                items: igdb.map((result) => ({ kind: 'igdb', id: `igdb:${result.igdbId}`, result }))
            });
        return g;
    }, [searching, typed, recentSearches.recent, library, igdb, targetEntry]);

    const items = groups.flatMap((g) => g.items);
    const activeIndex = Math.max(
        0,
        items.findIndex((i) => i.id === activeId)
    );
    const active = items[activeIndex];

    // The highlighted row follows the list when results change
    useEffect(() => {
        if (items.length && !items.some((i) => i.id === activeId)) setActiveId(items[0]!.id);
    }, [items, activeId]);
    useEffect(() => {
        if (active)
            document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, listId]);

    const go = (to: string) => {
        onClose();
        navigate(to);
    };
    const remember = () => recentSearches.add(typed);

    const runAction = async (entry: EntryDto, action: ActionKind) => {
        remember();
        try {
            if (action === 'queue') {
                await addToQueue.mutateAsync(entry.game.id);
                toast({ message: `${entry.game.name} added to your queue` });
            } else if (action === 'resume') {
                await api(`/entries/${entry.id}/resume`, { method: 'POST', body: {} });
                await invalidate();
                toast({ message: `Resumed ${entry.game.name}` });
            } else if (entry.platforms.length > 1) {
                // Which platform? The game page asks in place
                go(`/games/${entry.id}`);
                return;
            } else {
                await api(`/entries/${entry.id}/start`, {
                    method: 'POST',
                    body: {
                        date: todayLocal(),
                        ...(entry.platforms[0] ? { platformId: entry.platforms[0].id } : {})
                    }
                });
                await invalidate();
                toast({ message: `Started ${entry.game.name}` });
            }
            onClose();
        } catch (e) {
            toast({ message: e instanceof ApiRequestError ? e.message : "That didn't work." });
        }
    };

    const quickAdd = async (result: SearchResultDto) => {
        if (igdbRowState(result, added).kind !== 'add') return;
        const platformIds = defaultPlatformIds(recentPlatforms, result.platforms);
        if (platformIds.length === 0) return go(`/games/igdb/${result.igdbId}`);
        remember();
        try {
            await add({
                igdbId: result.igdbId,
                name: result.name,
                wishlisted: result.wishlisted,
                platformIds,
                as: 'notstarted'
            });
        } catch (e) {
            toast({ message: e instanceof ApiRequestError ? e.message : "Couldn't add the game." });
        }
    };

    const run = (item: Item) => {
        switch (item.kind) {
            case 'library':
                remember();
                return go(`/games/${item.entry.id}`);
            case 'action':
                return void runAction(item.entry, item.action);
            case 'igdb': {
                remember();
                const s = igdbRowState(item.result, added);
                return go(
                    s.kind === 'owned' || (s.kind === 'added' && s.entryId !== null)
                        ? `/games/${s.entryId}`
                        : `/games/igdb/${item.result.igdbId}`
                );
            }
            case 'recent':
                return setText(item.q);
            case 'jump':
                return go(item.to);
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActiveId(items[(activeIndex + step + items.length) % items.length]!.id);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.metaKey || e.ctrlKey || e.shiftKey) {
                const wanted: ActionKind = e.shiftKey ? 'queue' : 'start';
                const entry = targetEntry;
                if (!entry) return;
                const options = actionsFor(entry);
                const action = wanted === 'start' && options.includes('resume') ? 'resume' : wanted;
                if (options.includes(action)) void runAction(entry, action);
            } else if (active) run(active);
        } else if (e.key === 'Tab') {
            // Quick add the highlighted IGDB game; Tab never moves focus out of the palette
            e.preventDefault();
            if (active?.kind === 'igdb') void quickAdd(active.result);
        }
    };

    // Until the debounced query catches up with the typed one, show the loading rows, not "nothing"
    const loadingLibrary = searching && (!search.enabled || search.libraryLoading);
    const loadingIgdb = searching && (!search.enabled || search.igdbLoading);
    const nothing =
        searching && !loadingLibrary && !loadingIgdb && items.length === 0 && !search.igdbError;
    const mod = isMac() ? '⌘' : 'Ctrl';

    return (
        <div className="palette__panel">
            <div className="palette__field">
                <Search aria-hidden="true" />
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={items.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
                    aria-label="Search your library and IGDB"
                    placeholder="Search your library and IGDB, or jump to…"
                    autoComplete="off"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    data-autofocus
                    autoFocus
                />
                <kbd aria-hidden="true">Esc</kbd>
            </div>
            <div className="palette__list" id={listId} role="listbox" aria-label="Results">
                {groups.map((g) => (
                    <div key={g.label} role="group" aria-label={g.label} className="palette__group">
                        <div className="palette__label" aria-hidden="true">
                            {g.label}
                        </div>
                        {g.items.map((item) => (
                            <Option
                                key={item.id}
                                id={`${listId}-${item.id}`}
                                selected={item.id === active?.id}
                                onHover={() => setActiveId(item.id)}
                                onRun={() => run(item)}
                            >
                                {renderItem(
                                    item,
                                    search.q,
                                    added,
                                    mod,
                                    () => item.kind === 'igdb' && void quickAdd(item.result),
                                    undo
                                )}
                            </Option>
                        ))}
                    </div>
                ))}
                {loadingLibrary && <SkeletonRows label="Searching your library" />}
                {loadingIgdb && <SkeletonRows label="Searching IGDB" />}
                {searching && search.igdbError && !loadingIgdb && (
                    <p className="palette__note" role="alert">
                        IGDB search isn't available right now.
                        {search.igdbError instanceof ApiRequestError
                            ? ` ${search.igdbError.message}`
                            : ''}
                    </p>
                )}
                {nothing && <p className="palette__note">No games found for “{typed}”.</p>}
                {typed.length > 0 && !searching && (
                    <p className="palette__note">Type at least {MIN_QUERY} characters to search.</p>
                )}
            </div>
            <div className="palette__foot" aria-hidden="true">
                <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> navigate
                </span>
                <span>
                    <kbd>↵</kbd> open
                </span>
                <span>
                    <kbd>⇥</kbd> quick add to library
                </span>
                <span className="palette__foot-end">Library and IGDB in one place</span>
            </div>
            <p className="sr-only" role="status">
                {searching && !loadingLibrary && !loadingIgdb
                    ? `${results.library.length} in your library, ${results.add.length} to add from IGDB`
                    : ''}
            </p>
        </div>
    );
}

function Option({
    id,
    selected,
    onHover,
    onRun,
    children
}: {
    id: string;
    selected: boolean;
    onHover: () => void;
    onRun: () => void;
    children: ReactNode;
}) {
    return (
        <div
            id={id}
            role="option"
            aria-selected={selected}
            className="palette__row"
            data-active={selected || undefined}
            onMouseMove={onHover}
            onClick={onRun}
        >
            {children}
        </div>
    );
}

function renderItem(
    item: Item,
    query: string,
    added: ReturnType<typeof useAddedGames>['added'],
    mod: string,
    quickAdd: () => void,
    undo: (igdbId: number) => void
) {
    switch (item.kind) {
        case 'library':
            return <LibraryRowContent entry={item.entry} query={query} />;
        case 'igdb': {
            const state = igdbRowState(item.result, added).kind;
            const adding = state === 'add';
            return (
                <>
                    <IgdbRowContent result={item.result} query={query} added={added} />
                    {state === 'added' && (
                        <button
                            type="button"
                            tabIndex={-1}
                            className="palette__add"
                            aria-label={`Undo adding ${item.result.name}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                undo(item.result.igdbId);
                            }}
                        >
                            Undo
                        </button>
                    )}
                    {adding && (
                        <button
                            type="button"
                            tabIndex={-1}
                            className="palette__add"
                            aria-label={`Quick add ${item.result.name} to your library`}
                            onClick={(e) => {
                                e.stopPropagation();
                                quickAdd();
                            }}
                        >
                            <Plus aria-hidden="true" /> Add
                        </button>
                    )}
                </>
            );
        }
        case 'action': {
            const name = item.entry.game.name;
            const label =
                item.action === 'queue'
                    ? `Add ${name} to queue`
                    : item.action === 'resume'
                      ? `Resume ${name}`
                      : `Start playing ${name}`;
            const hint =
                item.action === 'queue'
                    ? 'Goes to the end of Up next'
                    : item.action === 'resume'
                      ? 'Back to Now playing'
                      : item.entry.platforms.length > 1
                        ? 'Pick the platform on the game page'
                        : 'Moves it to Now playing';
            return (
                <>
                    <span className="palette__icon" aria-hidden="true">
                        {item.action === 'queue' ? <ListPlus /> : <Play />}
                    </span>
                    <span className="srow__text">
                        <span className="srow__title">{label}</span>
                        <span className="srow__meta">{hint}</span>
                    </span>
                    <kbd className="palette__keys" aria-hidden="true">
                        {item.action === 'queue' ? '⇧↵' : `${mod}↵`}
                    </kbd>
                </>
            );
        }
        case 'recent':
            return (
                <>
                    <span className="palette__icon" aria-hidden="true">
                        <Clock />
                    </span>
                    <span className="srow__text">
                        <span className="srow__title">{item.q}</span>
                    </span>
                </>
            );
        case 'jump':
            return (
                <>
                    <span className="palette__icon" aria-hidden="true">
                        <ArrowRight />
                    </span>
                    <span className="srow__text">
                        <span className="srow__title">{item.label}</span>
                    </span>
                </>
            );
    }
}

function SkeletonRows({ label }: { label: string }) {
    return (
        <div role="status" aria-label={label}>
            {[0, 1].map((i) => (
                <div key={i} className="palette__row palette__row--skeleton" aria-hidden="true">
                    <span className="skeleton srow__cover" />
                    <span className="srow__text">
                        <span className="skeleton skeleton--line" style={{ width: '55%' }} />
                        <span className="skeleton skeleton--line" style={{ width: '30%' }} />
                    </span>
                </div>
            ))}
        </div>
    );
}
