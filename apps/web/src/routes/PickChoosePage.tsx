import { SelectSkeleton } from '../components/PageSkeletons';
import { ResultListSkeleton } from '../components/ResultSkeletons';
import type { EntryDto } from '@gamequeue/shared';
import { pickRandom, toCandidate } from '@gamequeue/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ListDetailDto } from '@gamequeue/shared';
import { useEntries } from '../api/collection';
import { fetchAll } from '../api/paging';
import { useList, useLists } from '../api/lists';
import { useQueue } from '../api/queue';
import { Cover } from '../components/Cover';
import { PickResult, Rolling, rollDelay } from '../components/PickResult';
import { MetaLine } from '../components/MetaLine';
import { PlatformTags } from '../components/PlatformIcon';
import { useDebounced, yearOf, usePageTitle } from '../lib';
import { ChevronLeft, Dices, ListChecks, Plus, X } from 'lucide-react';

const MIN_GAMES = 2;

export function PickChoosePage() {
    usePageTitle('Choose between games');
    const [chosen, setChosen] = useState<EntryDto[]>([]);
    const [seen, setSeen] = useState<number[]>([]);
    const [winner, setWinner] = useState<EntryDto>();
    const [wrapped, setWrapped] = useState(false);
    const [rolling, setRolling] = useState(false);

    const building = !rolling && !winner;

    function add(entries: EntryDto[]) {
        setChosen((cur) => {
            const have = new Set(cur.map((e) => e.id));
            return [...cur, ...entries.filter((e) => !have.has(e.id))];
        });
    }

    function run(exclude: number[]) {
        const outcome = pickRandom(chosen.map(toCandidate), { excludeIds: exclude });
        const entry = chosen.find((e) => e.id === outcome.id);
        if (!entry) return;
        setWinner(undefined);
        setRolling(true);
        void rollDelay().then(() => {
            setWinner(entry);
            setRolling(false);
        });
        setWrapped(outcome.wrapped);
        setSeen(outcome.wrapped ? [entry.id] : [...exclude, entry.id]);
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <Link className="back-link" to="/pick">
                        <ChevronLeft aria-hidden="true" />
                        Random pick
                    </Link>
                    <h1>
                        <ListChecks aria-hidden="true" />
                        Choose between games
                    </h1>
                    <p className="muted">
                        Gather a few contenders and let fate pick the one you play.
                    </p>
                </div>
            </div>

            {building && (
                <div className="stack">
                    <Contenders
                        chosen={chosen}
                        onRemove={(id) => setChosen((c) => c.filter((e) => e.id !== id))}
                        onClear={() => setChosen([])}
                    />
                    <div>
                        <button
                            className="btn btn--primary"
                            disabled={chosen.length < MIN_GAMES}
                            onClick={() => run([])}
                        >
                            <Dices />
                            Pick one for me
                        </button>
                        {chosen.length < MIN_GAMES && (
                            <span className="muted pick-hint">
                                Choose at least {MIN_GAMES} games.
                            </span>
                        )}
                    </div>
                    <FromList onAdd={add} />
                    <Search chosen={chosen} onAdd={(e) => add([e])} />
                </div>
            )}

            <div aria-live="polite">
                {rolling && (
                    <Rolling
                        covers={chosen.map((e) => ({
                            imageId: e.game.coverImageId,
                            name: e.game.name
                        }))}
                    />
                )}
                {winner && (
                    <PickResult
                        key={winner.id}
                        note={`Chosen from ${chosen.length} games${
                            wrapped ? ' · you’ve seen them all, so this starts over' : ''
                        }`}
                        entry={winner}
                        onReroll={() => run(seen)}
                        onPickAgain={() => {
                            setWinner(undefined);
                            setSeen([]);
                        }}
                        againLabel="Change games"
                    />
                )}
            </div>
        </section>
    );
}

function Contenders({
    chosen,
    onRemove,
    onClear
}: {
    chosen: EntryDto[];
    onRemove: (id: number) => void;
    onClear: () => void;
}) {
    return (
        <div className="panel">
            <div className="row pick-contenders__head">
                <h2 className="pick-contenders__title">
                    Contenders <span className="muted">({chosen.length})</span>
                </h2>
                {chosen.length > 0 && (
                    <button className="btn btn--ghost" onClick={onClear}>
                        Clear all
                    </button>
                )}
            </div>
            {chosen.length === 0 ? (
                <p className="muted">No games yet. Add some below, or load a whole list at once.</p>
            ) : (
                <ul className="pick-contenders">
                    {chosen.map((e) => (
                        <li key={e.id} className="pick-contender">
                            <Cover imageId={e.game.coverImageId} name={e.game.name} />
                            <button
                                className="pick-contender__remove"
                                onClick={() => onRemove(e.id)}
                                aria-label={`Remove ${e.game.name}`}
                                title={`Remove ${e.game.name}`}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function FromList({ onAdd }: { onAdd: (entries: EntryDto[]) => void }) {
    const lists = useLists();
    const queue = useQueue(1); // only its id is needed
    const [listId, setListId] = useState(0);
    const options = [
        ...(queue.head ? [{ id: queue.head.id, name: 'Queue' }] : []),
        ...(lists.data ?? []).map((l) => ({ id: l.id, name: `List: ${l.name}` }))
    ];
    return (
        <div className="panel">
            <label className="field">
                <span>Load games from a list</span>
                {lists.isPending || queue.isPending ? (
                    <SelectSkeleton label="Loading your lists" />
                ) : (
                    <select value={listId} onChange={(e) => setListId(Number(e.target.value))}>
                        <option value={0}>Choose a list or the queue…</option>
                        {options.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                )}
            </label>
            {listId > 0 && <LoadList key={listId} id={listId} onAdd={onAdd} />}
        </div>
    );
}

function LoadList({ id, onAdd }: { id: number; onAdd: (entries: EntryDto[]) => void }) {
    const list = useList(id);
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    if (list.isPending)
        return (
            <span
                className="skeleton skeleton--btn skeleton--btn-wide"
                role="status"
                aria-label="Loading list"
            />
        );
    if (list.isError || list.total === undefined)
        return <p className="muted">Couldn't load that list.</p>;
    const { total } = list;
    if (total === 0) return <p className="muted">That list is empty.</p>;

    // The list page only loads a page at a time; adding the whole list reads the rest now
    async function addAll() {
        setLoading(true);
        setFailed(false);
        try {
            onAdd(
                await fetchAll(
                    queryClient,
                    ['list', id],
                    `/lists/${id}`,
                    (r: { list: ListDetailDto }) => ({
                        items: r.list.entries,
                        total: r.list.total
                    })
                )
            );
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }
    return (
        <div className="pick-load">
            <button className="btn" onClick={addAll} disabled={loading}>
                <Plus />
                {loading ? 'Adding…' : `Add ${total} ${total === 1 ? 'game' : 'games'}`}
            </button>
            {failed && (
                <p className="form-error" role="alert">
                    Couldn't load that list.
                </p>
            )}
        </div>
    );
}

function Search({ chosen, onAdd }: { chosen: EntryDto[]; onAdd: (e: EntryDto) => void }) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 250);
    // A few more than are shown, so games already chosen can be skipped
    const results = useEntries(new URLSearchParams(q ? { view: 'all', q } : { view: 'all' }), 20);
    const have = new Set(chosen.map((e) => e.id));
    const matches = (results.data?.entries ?? []).filter((e) => !have.has(e.id));
    return (
        <div className="panel">
            <label className="field">
                <span>Add games from your collection</span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search by title…"
                    autoComplete="off"
                />
            </label>
            {results.isPending ? (
                <ResultListSkeleton label="Searching…" />
            ) : matches.length === 0 ? (
                <p className="muted">
                    {results.data?.total
                        ? 'Everything that matches is already added.'
                        : 'No matches.'}
                </p>
            ) : (
                <>
                    <ul className="results">
                        {matches.slice(0, 8).map((e) => (
                            <li key={e.id}>
                                <button className="result" onClick={() => onAdd(e)}>
                                    <Cover imageId={e.game.coverImageId} name={e.game.name} />
                                    <span className="result__text">
                                        <strong>{e.game.name}</strong>
                                        <span className="muted">
                                            <MetaLine
                                                parts={[
                                                    yearOf(e.game.releaseDate),
                                                    <PlatformTags key="p" platforms={e.platforms} />
                                                ]}
                                            />
                                        </span>
                                    </span>
                                    <span className="badge">+ Add</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {(results.data?.total ?? 0) > 8 && (
                        <p className="muted">
                            Showing 8 of {results.data?.total}. Type to narrow it down.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
