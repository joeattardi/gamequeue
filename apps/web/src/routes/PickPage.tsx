import type { EntryDto, PickInput, PickResultDto } from '@gamequeue/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useFacets } from '../api/collection';
import { useLists, usePick } from '../api/lists';
import { useQueue } from '../api/queue';
import { ApiRequestError } from '../api/client';
import { needsPlatform, useSlots } from '../api/slots';
import { Cover } from '../components/Cover';
import { useAssign } from '../components/useAssign';
import { formatMinutes, platformLabel, yearOf } from '../lib';

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

export function PickPage() {
    const [params] = useSearchParams();
    const facets = useFacets();
    const lists = useLists();
    const queue = useQueue();
    const pick = usePick();

    const [source, setSource] = useState(
        params.get('list') ? `list:${params.get('list')}` : 'backlog'
    );
    const [platforms, setPlatforms] = useState(new Set<number>());
    const [genres, setGenres] = useState(new Set<string>());
    const [tags, setTags] = useState(new Set<string>());
    const [maxMinutes, setMaxMinutes] = useState(0);
    const [includePaused, setIncludePaused] = useState(false);

    const [seen, setSeen] = useState<number[]>([]);
    const [result, setResult] = useState<PickResultDto>();
    const [error, setError] = useState<string>();

    function run(exclude: number[]) {
        setError(undefined);
        const input: PickInput = {
            source: source.startsWith('list:')
                ? { type: 'list', listId: Number(source.slice(5)) }
                : { type: 'backlog' },
            filters: {
                platformIds: [...platforms],
                genres: [...genres],
                tags: [...tags],
                ...(maxMinutes ? { maxTtbMinutes: maxMinutes } : {}),
                includePaused
            },
            excludeEntryIds: exclude
        };
        pick.mutate(input, {
            onSuccess: (res) => {
                setResult(res);
                setSeen(
                    res.entry
                        ? res.wrapped
                            ? [res.entry.id]
                            : [...exclude, res.entry.id]
                        : exclude
                );
            },
            onError: (e) =>
                setError(e instanceof ApiRequestError ? e.message : "Couldn't pick a game.")
        });
    }

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>Random pick</h1>
                    <p className="muted">
                        Can't decide? Let fate choose from your backlog, queue or a list.
                    </p>
                </div>
            </div>

            <form
                className="panel pick-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    run([]);
                }}
            >
                <label className="field">
                    <span>Pick from</span>
                    <select value={source} onChange={(e) => setSource(e.target.value)}>
                        <option value="backlog">Backlog (unplayed games)</option>
                        {queue.data && <option value={`list:${queue.data.id}`}>Queue</option>}
                        {lists.data?.map((l) => (
                            <option key={l.id} value={`list:${l.id}`}>
                                List: {l.name}
                            </option>
                        ))}
                    </select>
                </label>

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
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={includePaused}
                            onChange={(e) => setIncludePaused(e.target.checked)}
                        />
                        Include paused games
                    </label>
                </div>
                {maxMinutes > 0 && (
                    <p className="muted">
                        Games with no time-to-beat data are left out when you set a length.
                    </p>
                )}
                <div>
                    <button className="btn btn--primary" type="submit" disabled={pick.isPending}>
                        {pick.isPending ? 'Picking…' : 'Pick for me'}
                    </button>
                </div>
            </form>

            <p className="form-error" role="alert">
                {error}
            </p>
            <div aria-live="polite">
                {result &&
                    (result.entry ? (
                        <Result
                            key={result.entry.id}
                            result={result}
                            entry={result.entry}
                            rerolling={pick.isPending}
                            onReroll={() => run(seen)}
                        />
                    ) : (
                        <div className="empty">
                            <p>
                                <strong>Nothing matches.</strong>
                            </p>
                            <p className="muted">
                                Try loosening the filters or picking from a different source.
                            </p>
                        </div>
                    ))}
            </div>
        </section>
    );
}

function Chips({
    legend,
    items,
    selected,
    onToggle
}: {
    legend: string;
    items: { key: number | string; label: string }[] | undefined;
    selected: Set<number | string> | Set<number> | Set<string>;
    onToggle: (key: number | string) => void;
}) {
    if (!items?.length) return null;
    return (
        <fieldset className="checks">
            <legend className="field-legend">{legend}</legend>
            {items.map((i) => (
                <label key={i.key} className="check">
                    <input
                        type="checkbox"
                        checked={(selected as Set<number | string>).has(i.key)}
                        onChange={() => onToggle(i.key)}
                    />
                    {i.label}
                </label>
            ))}
        </fieldset>
    );
}

function Result({
    result,
    entry,
    rerolling,
    onReroll
}: {
    result: PickResultDto;
    entry: EntryDto;
    rerolling: boolean;
    onReroll: () => void;
}) {
    const { game } = entry;
    const slots = useSlots();
    const { assignTo, pending, error } = useAssign();
    const [platformId, setPlatformId] = useState('');
    const [placedIn, setPlacedIn] = useState<string>();
    const platformNeeded = needsPlatform(entry);

    return (
        <article className="pick-result panel">
            <div className="pick-result__cover">
                <Cover imageId={game.coverImageId} name={game.name} />
            </div>
            <div className="stack">
                <p className="muted">
                    {result.candidateCount}{' '}
                    {result.candidateCount === 1 ? 'game matches' : 'games match'}
                    {result.wrapped && ' · you’ve seen them all, so this starts over'}
                </p>
                <h2 className="pick-result__title">{game.name}</h2>
                <p className="muted">
                    {[
                        yearOf(game.releaseDate),
                        game.genres.join(', '),
                        entry.platforms.map(platformLabel).join(', '),
                        entry.ttbMinutes !== null
                            ? `~${formatMinutes(entry.ttbMinutes)} to beat`
                            : null,
                        game.igdbRating !== null ? `IGDB ${game.igdbRating}` : null
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
                {entry.status === 'paused' && <span className="badge badge--paused">paused</span>}
                {game.summary && <p className="summary summary--clamp">{game.summary}</p>}

                {placedIn ? (
                    <p role="status">
                        <strong>Now playing in {placedIn}.</strong>{' '}
                        <Link to="/">See your slots</Link>
                    </p>
                ) : (
                    <>
                        {platformNeeded && (
                            <label className="field">
                                <span>Playing it on</span>
                                <select
                                    value={platformId}
                                    onChange={(e) => setPlatformId(e.target.value)}
                                >
                                    <option value="">Choose a platform…</option>
                                    {entry.platforms.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="row">
                            {slots.data?.map((slot, i) => (
                                <button
                                    key={slot.id}
                                    className={i === 0 ? 'btn btn--primary' : 'btn'}
                                    disabled={pending || (platformNeeded && !platformId)}
                                    onClick={() =>
                                        assignTo(slot, entry, {
                                            platformId: platformId ? Number(platformId) : undefined,
                                            onDone: () => setPlacedIn(slot.name)
                                        })
                                    }
                                >
                                    Make this my {slot.name}
                                </button>
                            ))}
                        </div>
                        <p className="form-error" role="alert">
                            {error}
                        </p>
                        <div className="row">
                            <button className="btn" onClick={onReroll} disabled={rerolling}>
                                Re-roll
                            </button>
                            <Link className="btn btn--ghost" to={`/games/${entry.id}`}>
                                Open game
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </article>
    );
}
