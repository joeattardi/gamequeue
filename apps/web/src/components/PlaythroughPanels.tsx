import {
    availableActions,
    RATING_MAX,
    type EntryDto,
    type PlaythroughDto
} from '@gamequeue/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
    useDeletePlaythrough,
    useEntryAction,
    useLogPlaythrough,
    usePatchPlaythrough,
    usePlaythroughs
} from '../api/collection';
import { ApiRequestError } from '../api/client';
import { useConfirm } from './Confirm';
import { StarRating } from './StarRating';
import { daysBetween, formatDate, platformLabel, todayLocal } from '../lib';

const errorText = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

function PlatformSelect({
    platforms,
    value,
    onChange
}: {
    platforms: { id: number; name: string; abbreviation: string | null }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <label className="field">
            <span>Platform</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {platforms.length > 1 && <option value="">Choose…</option>}
                {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                        {platformLabel(p)}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** Status plus whatever actions are allowed from it. */
export function StatusPanel({ entry }: { entry: EntryDto }) {
    const act = useEntryAction(entry.id);
    const [mode, setMode] = useState<'finish' | 'abandon' | null>(null);
    const [error, setError] = useState<string>();
    const actions = availableActions(entry.status);

    const run = (action: Parameters<typeof act.mutate>[0], after?: () => void) => {
        setError(undefined);
        act.mutate(action, {
            onSuccess: () => {
                setMode(null);
                after?.();
            },
            onError: (e) => setError(errorText(e))
        });
    };

    return (
        <section aria-labelledby="status-h" className="panel">
            <div className="panel__head">
                <h2 id="status-h">Status</h2>
                <span className={`badge badge--${entry.status}`}>{entry.status}</span>
            </div>
            {entry.openPlaythrough && (
                <p className="muted">
                    Started {formatDate(entry.openPlaythrough.startedOn)}
                    {entry.openPlaythrough.platform &&
                        ` on ${platformLabel(entry.openPlaythrough.platform)}`}
                </p>
            )}
            {entry.status === 'finished' && entry.lastFinishedOn && (
                <p className="muted">Last finished {formatDate(entry.lastFinishedOn)}</p>
            )}

            {actions.includes('start') && (
                <StartForm
                    entry={entry}
                    replay={entry.status !== 'unplayed'}
                    pending={act.isPending}
                    onStart={(body) => run({ action: 'start', body })}
                />
            )}

            <div className="row">
                {actions.includes('pause') && (
                    <button
                        className="btn"
                        disabled={act.isPending}
                        onClick={() => run({ action: 'pause' })}
                    >
                        Pause
                    </button>
                )}
                {actions.includes('resume') && (
                    <button
                        className="btn btn--primary"
                        disabled={act.isPending}
                        onClick={() => run({ action: 'resume' })}
                    >
                        Resume
                    </button>
                )}
                {actions.includes('finish') && (
                    <button
                        className="btn btn--primary"
                        onClick={() => setMode(mode === 'finish' ? null : 'finish')}
                        aria-expanded={mode === 'finish'}
                    >
                        Mark finished
                    </button>
                )}
                {actions.includes('abandon') && (
                    <button
                        className="btn"
                        onClick={() => setMode(mode === 'abandon' ? null : 'abandon')}
                        aria-expanded={mode === 'abandon'}
                    >
                        Abandon
                    </button>
                )}
            </div>

            {mode && (
                <CloseForm
                    key={mode}
                    mode={mode}
                    pending={act.isPending}
                    onSubmit={(body) => run({ action: mode, body })}
                    onCancel={() => setMode(null)}
                />
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
        </section>
    );
}

function StartForm({
    entry,
    replay,
    pending,
    onStart
}: {
    entry: EntryDto;
    replay: boolean;
    pending: boolean;
    onStart: (body: { platformId?: number; date: string }) => void;
}) {
    const [date, setDate] = useState(todayLocal());
    const [platformId, setPlatformId] = useState(
        entry.platforms.length === 1 ? String(entry.platforms[0]!.id) : ''
    );
    function submit(e: FormEvent) {
        e.preventDefault();
        onStart({ date, ...(platformId ? { platformId: Number(platformId) } : {}) });
    }
    return (
        <form className="inline-form" onSubmit={submit}>
            {entry.platforms.length > 1 && (
                <PlatformSelect
                    platforms={entry.platforms}
                    value={platformId}
                    onChange={setPlatformId}
                />
            )}
            <label className="field">
                <span>Start date</span>
                <input
                    type="date"
                    value={date}
                    max={todayLocal()}
                    onChange={(e) => setDate(e.target.value)}
                    required
                />
            </label>
            <button
                className="btn btn--primary"
                type="submit"
                disabled={pending || (entry.platforms.length > 1 && !platformId)}
            >
                {replay ? 'Play again' : 'Start playing'}
            </button>
        </form>
    );
}

export function CloseForm({
    mode,
    pending,
    onSubmit,
    onCancel
}: {
    mode: 'finish' | 'abandon';
    pending: boolean;
    onSubmit: (body: { date: string; rating: number | null }) => void;
    onCancel: () => void;
}) {
    const [date, setDate] = useState(todayLocal());
    const [rating, setRating] = useState<number | null>(null);
    function submit(e: FormEvent) {
        e.preventDefault();
        onSubmit({ date, rating });
    }
    return (
        <form className="inline-form subpanel" onSubmit={submit}>
            <label className="field">
                <span>{mode === 'finish' ? 'Finished on' : 'Abandoned on'}</span>
                <input
                    type="date"
                    value={date}
                    max={todayLocal()}
                    onChange={(e) => setDate(e.target.value)}
                    required
                />
            </label>
            <StarRating value={rating} onChange={setRating} label="Rating for this playthrough" />
            <button className="btn btn--primary" type="submit" disabled={pending}>
                Confirm
            </button>
            <button className="btn btn--ghost" type="button" onClick={onCancel}>
                Cancel
            </button>
        </form>
    );
}

/** Every playthrough of this game, with edit/delete and a way to log past ones. */
export function HistoryPanel({ entry }: { entry: EntryDto }) {
    const history = usePlaythroughs(entry.id);
    return (
        <section aria-labelledby="history-h" className="panel">
            <h2 id="history-h">Playthroughs</h2>
            {history.isPending ? (
                <p className="muted" role="status">
                    Loading…
                </p>
            ) : history.data?.length === 0 ? (
                <p className="muted">No playthroughs yet.</p>
            ) : (
                <ul className="history">
                    {history.data?.map((p) => (
                        <HistoryRow key={p.id} p={p} entry={entry} />
                    ))}
                </ul>
            )}
            <details className="disclosure">
                <summary>Log a past playthrough</summary>
                <LogForm entry={entry} />
            </details>
        </section>
    );
}

function HistoryRow({ p, entry }: { p: PlaythroughDto; entry: EntryDto }) {
    const [editing, setEditing] = useState(false);
    const del = useDeletePlaythrough();
    const confirm = useConfirm();
    const days = daysBetween(p.startedOn, p.endedOn);
    const label = p.outcome ?? 'in progress';
    if (editing)
        return (
            <li className="history__row">
                <EditForm p={p} entry={entry} onDone={() => setEditing(false)} />
            </li>
        );
    return (
        <li className="history__row">
            <div className="history__main">
                <span className={`badge badge--${p.outcome ?? 'playing'}`}>{label}</span>
                <span>
                    {formatDate(p.startedOn)}
                    {p.outcome ? ` → ${formatDate(p.endedOn)}` : ' → now'}
                </span>
                <span className="muted">
                    {[
                        p.platform && platformLabel(p.platform),
                        days !== null && `${days} ${days === 1 ? 'day' : 'days'}`,
                        p.rating !== null && `★ ${p.rating}/${RATING_MAX}`
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
            </div>
            <div className="row">
                <button className="btn btn--ghost" onClick={() => setEditing(true)}>
                    Edit
                </button>
                <button
                    className="btn btn--ghost btn--danger"
                    disabled={del.isPending}
                    onClick={async () =>
                        (await confirm({
                            title: 'Delete this playthrough?',
                            message:
                                'It is removed from the game’s history, and the game’s status is updated to match.',
                            confirmLabel: 'Delete playthrough',
                            tone: 'danger'
                        })) && del.mutate(p.id)
                    }
                >
                    Delete
                </button>
            </div>
        </li>
    );
}

function EditForm({
    p,
    entry,
    onDone
}: {
    p: PlaythroughDto;
    entry: EntryDto;
    onDone: () => void;
}) {
    const patch = usePatchPlaythrough();
    const [startedOn, setStartedOn] = useState(p.startedOn ?? '');
    const [endedOn, setEndedOn] = useState(p.endedOn ?? '');
    const [outcome, setOutcome] = useState(p.outcome ?? '');
    const [rating, setRating] = useState<number | null>(p.rating);
    const [platformId, setPlatformId] = useState(p.platform ? String(p.platform.id) : '');
    const [error, setError] = useState<string>();
    const open = p.outcome === null;
    const platforms = [
        ...entry.platforms,
        ...(p.platform && !entry.platforms.some((x) => x.id === p.platform!.id) ? [p.platform] : [])
    ];

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        patch.mutate(
            {
                id: p.id,
                patch: {
                    startedOn: startedOn || null,
                    rating,
                    ...(platformId ? { platformId: Number(platformId) } : {}),
                    ...(open
                        ? {}
                        : {
                              endedOn: endedOn || null,
                              outcome: outcome as 'finished' | 'abandoned'
                          })
                }
            },
            { onSuccess: onDone, onError: (e) => setError(errorText(e)) }
        );
    }
    return (
        <form className="stack" onSubmit={submit}>
            <div className="inline-form">
                <label className="field">
                    <span>Started</span>
                    <input
                        type="date"
                        value={startedOn}
                        max={todayLocal()}
                        onChange={(e) => setStartedOn(e.target.value)}
                    />
                </label>
                {!open && (
                    <label className="field">
                        <span>Ended</span>
                        <input
                            type="date"
                            value={endedOn}
                            max={todayLocal()}
                            onChange={(e) => setEndedOn(e.target.value)}
                        />
                    </label>
                )}
                {!open && (
                    <label className="field">
                        <span>Outcome</span>
                        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                            <option value="finished">Finished</option>
                            <option value="abandoned">Abandoned</option>
                        </select>
                    </label>
                )}
                <PlatformSelect platforms={platforms} value={platformId} onChange={setPlatformId} />
                <StarRating value={rating} onChange={setRating} />
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div className="row">
                <button className="btn btn--primary" type="submit" disabled={patch.isPending}>
                    Save
                </button>
                <button className="btn btn--ghost" type="button" onClick={onDone}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

function LogForm({ entry }: { entry: EntryDto }): ReactNode {
    const log = useLogPlaythrough(entry.id);
    const [outcome, setOutcome] = useState<'finished' | 'abandoned'>('finished');
    const [startedOn, setStartedOn] = useState('');
    const [endedOn, setEndedOn] = useState('');
    const [rating, setRating] = useState<number | null>(null);
    const [platformId, setPlatformId] = useState(
        entry.platforms.length === 1 ? String(entry.platforms[0]!.id) : ''
    );
    const [error, setError] = useState<string>();

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        log.mutate(
            {
                outcome,
                startedOn: startedOn || null,
                endedOn: endedOn || null,
                rating,
                ...(platformId ? { platformId: Number(platformId) } : {})
            },
            {
                onSuccess: () => {
                    setStartedOn('');
                    setEndedOn('');
                    setRating(null);
                },
                onError: (e) => setError(errorText(e))
            }
        );
    }
    return (
        <form className="stack" onSubmit={submit}>
            <p className="muted">Leave a date blank if you don't remember it.</p>
            <div className="inline-form">
                <label className="field">
                    <span>Outcome</span>
                    <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                    >
                        <option value="finished">Finished</option>
                        <option value="abandoned">Abandoned</option>
                    </select>
                </label>
                <PlatformSelect
                    platforms={entry.platforms}
                    value={platformId}
                    onChange={setPlatformId}
                />
                <label className="field">
                    <span>Started</span>
                    <input
                        type="date"
                        value={startedOn}
                        max={todayLocal()}
                        onChange={(e) => setStartedOn(e.target.value)}
                    />
                </label>
                <label className="field">
                    <span>Ended</span>
                    <input
                        type="date"
                        value={endedOn}
                        max={todayLocal()}
                        onChange={(e) => setEndedOn(e.target.value)}
                    />
                </label>
                <StarRating value={rating} onChange={setRating} />
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
            <div>
                <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={log.isPending || (entry.platforms.length > 1 && !platformId)}
                >
                    Add playthrough
                </button>
            </div>
        </form>
    );
}
