import type { EntryDto } from '@gamequeue/shared';
import { pickRandom, toCandidate } from '@gamequeue/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useEntries } from '../api/collection';
import { useList, useLists } from '../api/lists';
import { useQueue } from '../api/queue';
import { Cover } from '../components/Cover';
import { PickResult, Rolling, rollDelay } from '../components/PickResult';
import { MetaLine } from '../components/MetaLine';
import { PlatformTags } from '../components/PlatformIcon';
import { useDebounced, yearOf } from '../lib';
import { ChevronLeft, Dices, ListChecks, Plus, X } from 'lucide-react';

const MIN_GAMES = 2;

export function PickChoosePage() {
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
    const queue = useQueue();
    const [listId, setListId] = useState(0);
    const options = [
        ...(queue.data ? [{ id: queue.data.id, name: 'Queue' }] : []),
        ...(lists.data ?? []).map((l) => ({ id: l.id, name: `List: ${l.name}` }))
    ];
    return (
        <div className="panel">
            <label className="field">
                <span>Load games from a list</span>
                <select value={listId} onChange={(e) => setListId(Number(e.target.value))}>
                    <option value={0}>Choose a list or the queue…</option>
                    {options.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.name}
                        </option>
                    ))}
                </select>
            </label>
            {listId > 0 && <LoadList key={listId} id={listId} onAdd={onAdd} />}
        </div>
    );
}

function LoadList({ id, onAdd }: { id: number; onAdd: (entries: EntryDto[]) => void }) {
    const list = useList(id);
    if (list.isPending) return <p className="muted">Loading…</p>;
    if (!list.data) return <p className="muted">Couldn't load that list.</p>;
    const { entries } = list.data;
    if (entries.length === 0) return <p className="muted">That list is empty.</p>;
    return (
        <div className="pick-load">
            <button className="btn" onClick={() => onAdd(entries)}>
                <Plus />
                Add {entries.length} {entries.length === 1 ? 'game' : 'games'}
            </button>
        </div>
    );
}

function Search({ chosen, onAdd }: { chosen: EntryDto[]; onAdd: (e: EntryDto) => void }) {
    const [text, setText] = useState('');
    const q = useDebounced(text.trim(), 250);
    const results = useEntries(new URLSearchParams(q ? { view: 'all', q } : { view: 'all' }));
    const have = new Set(chosen.map((e) => e.id));
    const matches = (results.data ?? []).filter((e) => !have.has(e.id));
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
                <p className="muted" role="status">
                    Searching…
                </p>
            ) : matches.length === 0 ? (
                <p className="muted">
                    {results.data?.length
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
                    {matches.length > 8 && (
                        <p className="muted">
                            Showing 8 of {matches.length}. Type to narrow it down.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
