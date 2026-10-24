import { SelectSkeleton } from '../components/PageSkeletons';
import { ResultListSkeleton } from '../components/ResultSkeletons';
import type { EntryDto, SearchResultDto } from '@gamequeue/shared';
import { pickRandom } from '@gamequeue/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ListDetailDto } from '@gamequeue/shared';
import { useEntry, useGameSearch } from '../api/collection';
import { ApiRequestError } from '../api/client';
import { fetchAll } from '../api/paging';
import { useList, useLists } from '../api/lists';
import { useQueue } from '../api/queue';
import { Cover } from '../components/Cover';
import {
    PickResult,
    PickResultSkeleton,
    Rolling,
    rollDelay,
    UnownedPickResult
} from '../components/PickResult';
import { MetaLine } from '../components/MetaLine';
import { PlatformTags } from '../components/PlatformIcon';
import { useDebounced, usePageTitle } from '../lib';
import { ChevronLeft, Dices, ListChecks, Plus, X } from 'lucide-react';

/** A game in the running: from the collection (`entryId` set) or any IGDB game. Keyed by IGDB id. */
type Contender = SearchResultDto;

const fromEntry = (e: EntryDto): Contender => ({
    igdbId: e.game.id,
    name: e.game.name,
    year: e.game.releaseDate ? Number(e.game.releaseDate.slice(0, 4)) : null,
    coverImageId: e.game.coverImageId,
    igdbRating: e.game.igdbRating,
    platforms: e.platforms,
    entryId: e.id,
    wishlisted: false
});

const MIN_GAMES = 2;

export function PickChoosePage() {
    usePageTitle('Choose between games');
    const [chosen, setChosen] = useState<Contender[]>([]);
    const [seen, setSeen] = useState<number[]>([]);
    const [winner, setWinner] = useState<Contender>();
    const [wrapped, setWrapped] = useState(false);
    const [rolling, setRolling] = useState(false);

    const building = !rolling && !winner;

    function add(games: Contender[]) {
        setChosen((cur) => {
            const have = new Set(cur.map((g) => g.igdbId));
            return [...cur, ...games.filter((g) => !have.has(g.igdbId))];
        });
    }

    function run(exclude: number[]) {
        const outcome = pickRandom(
            chosen.map((g) => ({ id: g.igdbId })),
            { excludeIds: exclude }
        );
        const entry = chosen.find((g) => g.igdbId === outcome.id);
        if (!entry) return;
        setWinner(undefined);
        setRolling(true);
        void rollDelay().then(() => {
            setWinner(entry);
            setRolling(false);
        });
        setWrapped(outcome.wrapped);
        setSeen(outcome.wrapped ? [entry.igdbId] : [...exclude, entry.igdbId]);
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
                        onRemove={(id) => setChosen((c) => c.filter((g) => g.igdbId !== id))}
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
                    <Search chosen={chosen} onAdd={(g) => add([g])} />
                </div>
            )}

            <div aria-live="polite">
                {rolling && (
                    <Rolling
                        covers={chosen.map((g) => ({
                            imageId: g.coverImageId,
                            name: g.name
                        }))}
                    />
                )}
                {winner && (
                    <Winner
                        key={winner.igdbId}
                        game={winner}
                        note={`Chosen from ${chosen.length} games${
                            wrapped ? ' · you’ve seen them all, so this starts over' : ''
                        }`}
                        onReroll={() => run(seen)}
                        onPickAgain={() => {
                            setWinner(undefined);
                            setSeen([]);
                        }}
                    />
                )}
            </div>
        </section>
    );
}

/** Owned games get the full result with slot buttons; any other game gets add buttons. */
function Winner({
    game,
    note,
    onReroll,
    onPickAgain
}: {
    game: Contender;
    note: string;
    onReroll: () => void;
    onPickAgain: () => void;
}) {
    if (game.entryId === null)
        return (
            <UnownedPickResult
                note={note}
                game={game}
                onReroll={onReroll}
                onPickAgain={onPickAgain}
                againLabel="Change games"
            />
        );
    return (
        <OwnedWinner
            entryId={game.entryId}
            note={note}
            onReroll={onReroll}
            onPickAgain={onPickAgain}
        />
    );
}

function OwnedWinner({
    entryId,
    note,
    onReroll,
    onPickAgain
}: {
    entryId: number;
    note: string;
    onReroll: () => void;
    onPickAgain: () => void;
}) {
    const entry = useEntry(entryId);
    if (entry.isPending) return <PickResultSkeleton />;
    if (!entry.data)
        return (
            <p className="form-error" role="alert">
                Couldn't load that game.
            </p>
        );
    return (
        <PickResult
            note={note}
            entry={entry.data}
            onReroll={onReroll}
            onPickAgain={onPickAgain}
            againLabel="Change games"
        />
    );
}

function Contenders({
    chosen,
    onRemove,
    onClear
}: {
    chosen: Contender[];
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
                    {chosen.map((g) => (
                        <li key={g.igdbId} className="pick-contender">
                            <Cover imageId={g.coverImageId} name={g.name} />
                            <button
                                className="pick-contender__remove"
                                onClick={() => onRemove(g.igdbId)}
                                aria-label={`Remove ${g.name}`}
                                title={`Remove ${g.name}`}
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

function FromList({ onAdd }: { onAdd: (games: Contender[]) => void }) {
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

function LoadList({ id, onAdd }: { id: number; onAdd: (games: Contender[]) => void }) {
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
            const entries = await fetchAll(
                queryClient,
                ['list', id],
                `/lists/${id}`,
                (r: { list: ListDetailDto }) => ({
                    items: r.list.entries,
                    total: r.list.total
                })
            );
            onAdd(entries.map(fromEntry));
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

function Search({ chosen, onAdd }: { chosen: Contender[]; onAdd: (g: Contender) => void }) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 300);
    const results = useGameSearch(q);
    const searching = text.trim().length >= 2 && (results.isFetching || q !== text.trim());
    const have = new Set(chosen.map((g) => g.igdbId));
    const matches = (results.data ?? []).filter((g) => !have.has(g.igdbId));
    return (
        <div className="panel">
            <label className="field">
                <span>Add any game</span>
                <input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search by title…"
                    autoComplete="off"
                />
            </label>
            {text.trim().length < 2 ? (
                <p className="muted">Type at least 2 characters. Games you don't own work too.</p>
            ) : searching ? (
                <ResultListSkeleton label="Searching…" />
            ) : results.isError ? (
                <p className="form-error" role="alert">
                    {results.error instanceof ApiRequestError
                        ? results.error.message
                        : 'Search failed.'}
                </p>
            ) : matches.length === 0 ? (
                <p className="muted">
                    {results.data?.length
                        ? 'Everything that matches is already added.'
                        : 'No matches.'}
                </p>
            ) : (
                <ul className="results">
                    {matches.slice(0, 8).map((g) => (
                        <li key={g.igdbId}>
                            <button className="result" onClick={() => onAdd(g)}>
                                <Cover imageId={g.coverImageId} name={g.name} />
                                <span className="result__text">
                                    <strong>{g.name}</strong>
                                    <span className="muted">
                                        <MetaLine
                                            parts={[
                                                g.year,
                                                <PlatformTags
                                                    key="p"
                                                    platforms={g.platforms.slice(0, 4)}
                                                />
                                            ]}
                                        />
                                    </span>
                                </span>
                                {g.entryId !== null && <span className="badge">Owned</span>}
                                <span className="badge">+ Add</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
