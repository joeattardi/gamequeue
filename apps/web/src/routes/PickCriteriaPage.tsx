import { SelectSkeleton } from '../components/PageSkeletons';
import {
    ENTRY_STATUSES,
    PICK_MAX_COUNT,
    statusLabel,
    type EntryDto,
    type EntryStatus,
    type PickInput,
    type PickResultDto
} from '@gamequeue/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useFacets } from '../api/collection';
import { useLists, usePick } from '../api/lists';
import { useSmartLists } from '../api/smartLists';
import { useQueue } from '../api/queue';
import { ApiRequestError } from '../api/client';
import { Chips } from '../components/Chips';
import { PickChoices, PickResult, Rolling, rollDelay } from '../components/PickResult';
import { Cover } from '../components/Cover';
import { ChevronLeft, Dices, Layers3 } from 'lucide-react';
import { usePageTitle } from '../lib';

const MAX_TIMES = [
    { label: 'Any length', minutes: 0 },
    { label: 'Up to 2 hours', minutes: 120 },
    { label: 'Up to 5 hours', minutes: 300 },
    { label: 'Up to 10 hours', minutes: 600 },
    { label: 'Up to 20 hours', minutes: 1200 },
    { label: 'Up to 40 hours', minutes: 2400 }
];

const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
};

export function PickCriteriaPage() {
    usePageTitle('Pick by criteria');
    const [params] = useSearchParams();
    const facets = useFacets();
    const lists = useLists();
    const queue = useQueue(1); // only its id is needed
    const smartLists = useSmartLists();
    const pick = usePick();

    const [source, setSource] = useState(
        params.get('list')
            ? `list:${params.get('list')}`
            : params.get('smart')
              ? `smart:${params.get('smart')}`
              : 'collection'
    );
    const [platforms, setPlatforms] = useState(new Set<number>());
    const [genres, setGenres] = useState(new Set<string>());
    const [tags, setTags] = useState(new Set<string>());
    const [maxMinutes, setMaxMinutes] = useState(0);
    const [statuses, setStatuses] = useState(new Set<EntryStatus>());

    const [seen, setSeen] = useState<number[]>([]);
    // This visit's results, oldest first; `current` is the one on the card
    const [history, setHistory] = useState<Shown[]>([]);
    const [current, setCurrent] = useState<number | null>(null);
    // A pick of three waiting for the user to choose one
    const [choices, setChoices] = useState<{ entries: EntryDto[]; note: string } | null>(null);
    // The last answer when nothing matched, to explain why
    const [empty, setEmpty] = useState<PickResultDto | null>(null);
    const [error, setError] = useState<string>();
    const [rolling, setRolling] = useState(false);
    const shown = current === null ? null : history[current];

    // Options are shown until a game is picked; "Pick again" brings them back.
    const showOptions = !rolling && !shown && !choices;

    function pickAgain() {
        setCurrent(null);
        setChoices(null);
        setEmpty(null);
        setSeen([]);
    }

    function show(entry: EntryDto, note: string) {
        setHistory((h) => [...h, { entry, note }]);
        setCurrent(history.length);
    }

    function run(exclude: number[], count = 1) {
        setError(undefined);
        setRolling(true);
        const minimum = rollDelay();
        const input: PickInput = {
            source: source.startsWith('list:')
                ? { type: 'list', listId: Number(source.slice(5)) }
                : source.startsWith('smart:')
                  ? { type: 'smart', smartListId: Number(source.slice(6)) }
                  : source === 'backlog'
                    ? { type: 'backlog' }
                    : { type: 'collection' },
            filters: {
                platformIds: [...platforms],
                genres: [...genres],
                tags: [...tags],
                ...(maxMinutes ? { maxTtbMinutes: maxMinutes } : {}),
                statuses: [...statuses]
            },
            excludeEntryIds: exclude,
            count
        };
        pick.mutate(input, {
            onSuccess: async (res) => {
                await minimum;
                setRolling(false);
                const ids = res.entries.map((e) => e.id);
                setSeen(res.wrapped ? ids : [...exclude, ...ids]);
                const note = matchNote(res);
                if (res.entries.length === 0) {
                    setEmpty(res);
                    setChoices(null);
                    setCurrent(null);
                } else if (count > 1 && res.entries.length > 1) {
                    setEmpty(null);
                    setCurrent(null);
                    setChoices({ entries: res.entries, note });
                } else {
                    setEmpty(null);
                    setChoices(null);
                    show(res.entries[0]!, note);
                }
            },
            onError: (e) => {
                setRolling(false);
                setError(e instanceof ApiRequestError ? e.message : "Couldn't pick a game.");
            }
        });
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
                        <Dices aria-hidden="true" />
                        Pick by criteria
                    </h1>
                    <p className="muted">
                        Can't decide? Let fate choose from your collection, queue, a list or a smart
                        list.
                    </p>
                </div>
            </div>

            {showOptions && (
                <form
                    className="panel pick-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        run([]);
                    }}
                >
                    <label className="field">
                        <span>Pick from</span>
                        {lists.isPending || queue.isPending || smartLists.isPending ? (
                            <SelectSkeleton label="Loading your lists" />
                        ) : (
                            <select value={source} onChange={(e) => setSource(e.target.value)}>
                                <option value="collection">Whole collection</option>
                                <option value="backlog">Backlog (Not Started games)</option>
                                {queue.head && (
                                    <option value={`list:${queue.head.id}`}>Queue</option>
                                )}
                                {lists.data?.map((l) => (
                                    <option key={l.id} value={`list:${l.id}`}>
                                        List: {l.name}
                                    </option>
                                ))}
                                {smartLists.data?.map((l) => (
                                    <option key={l.id} value={`smart:${l.id}`}>
                                        Smart list: {l.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </label>

                    <Chips
                        legend="Status"
                        items={ENTRY_STATUSES.map((s) => ({ key: s, label: statusLabel(s) }))}
                        selected={statuses}
                        onToggle={(k) => setStatuses((s) => toggle(s, k as EntryStatus))}
                    />
                    <Chips
                        legend="Platform"
                        items={facets.data?.platforms.map((p) => ({ key: p.id, label: p.name }))}
                        selected={platforms}
                        onToggle={(k) => setPlatforms((s) => toggle(s, k as number))}
                    />
                    <Chips
                        legend="Genre"
                        items={facets.data?.genres.map((g) => ({ key: g.name, label: g.name }))}
                        selected={genres}
                        onToggle={(k) => setGenres((s) => toggle(s, k as string))}
                    />
                    <Chips
                        legend="Tag"
                        items={facets.data?.tags.map((t) => ({ key: t, label: t }))}
                        selected={tags}
                        onToggle={(k) => setTags((s) => toggle(s, k as string))}
                    />

                    <div className="inline-form">
                        <label className="field">
                            <span>Time to beat</span>
                            <select
                                value={maxMinutes}
                                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                            >
                                {MAX_TIMES.map((t) => (
                                    <option key={t.minutes} value={t.minutes}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {maxMinutes > 0 && (
                        <p className="muted">
                            Games with no time-to-beat data are left out when you set a length.
                        </p>
                    )}
                    <div className="row">
                        <button
                            className="btn btn--primary"
                            type="submit"
                            disabled={pick.isPending}
                        >
                            <Dices />
                            {pick.isPending ? 'Picking…' : 'Pick for me'}
                        </button>
                        <button
                            className="btn"
                            type="button"
                            disabled={pick.isPending}
                            onClick={() => run([], PICK_MAX_COUNT)}
                        >
                            <Layers3 />
                            Pick {PICK_MAX_COUNT} to choose from
                        </button>
                    </div>
                </form>
            )}

            <p className="form-error" role="alert">
                {error}
            </p>
            <div aria-live="polite">
                {rolling && <Rolling />}
                {!rolling && choices && (
                    <PickChoices
                        note={choices.note}
                        entries={choices.entries}
                        onChoose={(entry) => {
                            setChoices(null);
                            show(entry, `You chose it from ${choices.entries.length}`);
                        }}
                        onReroll={() => run(seen, PICK_MAX_COUNT)}
                        onPickAgain={pickAgain}
                    />
                )}
                {!rolling && shown && (
                    <PickResult
                        key={`${current}-${shown.entry.id}`}
                        note={shown.note}
                        entry={shown.entry}
                        onReroll={() => run(seen)}
                        onPickThree={() => run(seen, PICK_MAX_COUNT)}
                        onPickAgain={pickAgain}
                    />
                )}
                {!rolling && empty && !shown && !choices && (
                    <div className="empty">
                        <p>
                            <strong>Nothing matches.</strong>
                        </p>
                        <p className="muted">
                            {emptyReason(empty.poolStatuses, statuses) ??
                                'Try loosening the filters or picking from a different source.'}
                            {skippedNote(empty.skippedUnowned) &&
                                ` ${skippedNote(empty.skippedUnowned).replace(' · ', '')}.`}
                        </p>
                    </div>
                )}
            </div>
            {history.length > 1 && (
                <RollHistory
                    items={history}
                    current={current}
                    onSelect={(i) => {
                        setChoices(null);
                        setCurrent(i);
                    }}
                />
            )}
        </section>
    );
}

/** Tells the user when the list they picked from held games they don't own, which can't be picked. */
const skippedNote = (n: number) =>
    n > 0
        ? ` · ${n} ${n === 1 ? 'game on the list isn’t' : 'games on the list aren’t'} in your collection, so ${n === 1 ? 'it was' : 'they were'} skipped`
        : '';

/** Why a source with games in it still gave nothing: none of them has a status that was asked for. */
function emptyReason(counts: PickResultDto['poolStatuses'], wanted: Set<EntryStatus>) {
    const present = (Object.entries(counts) as [EntryStatus, number][]).filter(([, n]) => n > 0);
    const total = present.reduce((sum, [, n]) => sum + n, 0);
    if (total === 0) return 'There are no games from your collection here.';
    if (wanted.size === 0 || present.some(([s]) => wanted.has(s))) return null;
    const breakdown = present.map(([s, n]) => `${n} ${statusLabel(s).toLowerCase()}`).join(', ');
    return `${total === 1 ? '1 game is' : `${total} games are`} here, but none match the status you chose (${breakdown}).`;
}

interface Shown {
    entry: EntryDto;
    note: string;
}

/** "12 games match", plus whether the pool started over and what a list held that couldn't be picked. */
const matchNote = (res: PickResultDto) =>
    `${res.candidateCount} ${res.candidateCount === 1 ? 'game matches' : 'games match'}${
        res.wrapped ? ' · you’ve seen them all, so this starts over' : ''
    }${skippedNote(res.skippedUnowned)}`;

/** This visit's earlier results; selecting one puts it back on the card. */
function RollHistory({
    items,
    current,
    onSelect
}: {
    items: Shown[];
    current: number | null;
    onSelect: (index: number) => void;
}) {
    return (
        <section className="roll-history" aria-labelledby="roll-history-h">
            <h2 id="roll-history-h" className="roll-history__title">
                Earlier picks
            </h2>
            <ol className="roll-history__list">
                {items.map((item, i) => (
                    <li key={i}>
                        <button
                            type="button"
                            className="roll-history__item"
                            aria-current={i === current ? 'true' : undefined}
                            onClick={() => onSelect(i)}
                            title={item.entry.game.name}
                        >
                            <Cover
                                imageId={item.entry.game.coverImageId}
                                name={item.entry.game.name}
                            />
                            <span className="sr-only">{item.entry.game.name}</span>
                        </button>
                    </li>
                ))}
            </ol>
        </section>
    );
}
