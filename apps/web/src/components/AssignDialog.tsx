import type { EntryDto, SlotDto } from '@gamequeue/shared';
import { useMemo, useState } from 'react';
import { useEntries } from '../api/collection';
import { useQueue } from '../api/queue';
import { needsPlatform, useSlots } from '../api/slots';
import { platformLabel, yearOf } from '../lib';
import { Cover } from './Cover';
import { useAssign } from './useAssign';
import { useModalDialog } from './useModalDialog';

const BACKLOG = new URLSearchParams({ view: 'backlog' });
const PAUSED = new URLSearchParams({ view: 'all', status: 'paused' });
const PLAYING = new URLSearchParams({ view: 'all', status: 'playing' });

/** Choose a game for one slot: your queue first, then anything in progress, then the backlog. */
export function AssignDialog({ slot, onClose }: { slot: SlotDto | null; onClose: () => void }) {
    const ref = useModalDialog(slot !== null);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="assign-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {slot && <AssignBody slot={slot} onDone={onClose} />}
        </dialog>
    );
}

function AssignBody({ slot, onDone }: { slot: SlotDto; onDone: () => void }) {
    const backlog = useEntries(BACKLOG);
    const paused = useEntries(PAUSED);
    const playing = useEntries(PLAYING);
    const queue = useQueue();
    const slots = useSlots();
    const { assignTo, pending, error } = useAssign();
    const [text, setText] = useState('');
    const [picked, setPicked] = useState<EntryDto>();
    const [platformId, setPlatformId] = useState('');

    const candidates = useMemo(() => {
        // Queue first, then in progress (playing, then paused), then the backlog
        const seen = new Set<number>();
        const all = [
            ...(queue.data?.entries ?? []),
            ...(playing.data ?? []),
            ...(paused.data ?? []),
            ...(backlog.data ?? [])
        ].filter((e) => e.id !== slot.entry?.id && !seen.has(e.id) && seen.add(e.id));
        const q = text.trim().toLowerCase();
        return q ? all.filter((e) => e.game.name.toLowerCase().includes(q)) : all;
    }, [queue.data, backlog.data, paused.data, playing.data, text, slot.entry?.id]);
    const slotName = (id: number | null) => slots.data?.find((s) => s.id === id)?.name;

    function choose(entry: EntryDto) {
        if (needsPlatform(entry)) return setPicked(entry);
        assignTo(slot, entry, { onDone });
    }

    return (
        <div className="dialog__body">
            <div className="dialog__head">
                <h2 id="assign-title">
                    {slot.entry
                        ? `Swap out ${slot.entry.game.name}`
                        : `Choose a game for ${slot.name}`}
                </h2>
                <button className="btn btn--ghost" onClick={onDone} aria-label="Close">
                    ✕
                </button>
            </div>
            {picked ? (
                <div className="stack">
                    <p>
                        <strong>{picked.game.name}</strong> is on several of your platforms. Which
                        one are you playing it on?
                    </p>
                    <label className="field">
                        <span>Platform</span>
                        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                            <option value="">Choose…</option>
                            {picked.platforms.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                    <div className="row">
                        <button className="btn" onClick={() => setPicked(undefined)}>
                            Back
                        </button>
                        <button
                            className="btn btn--primary"
                            disabled={!platformId || pending}
                            onClick={() =>
                                assignTo(slot, picked, { platformId: Number(platformId), onDone })
                            }
                        >
                            Start playing
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {slot.entry && (
                        <p className="muted">
                            {slot.entry.game.name} will be paused, not removed from your collection.
                        </p>
                    )}
                    <label className="field">
                        <span>Search your queue, games in progress and your backlog</span>
                        <input
                            type="search"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            autoFocus
                            data-autofocus
                            autoComplete="off"
                        />
                    </label>
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                    {backlog.isPending ||
                    paused.isPending ||
                    playing.isPending ||
                    queue.isPending ? (
                        <p className="muted" role="status">
                            Loading…
                        </p>
                    ) : candidates.length === 0 ? (
                        <p className="muted">
                            {text ? 'No matches.' : 'Nothing to choose from. Add some games first.'}
                        </p>
                    ) : (
                        <ul className="results">
                            {candidates.map((e) => (
                                <li key={e.id}>
                                    <button
                                        className="result"
                                        disabled={pending}
                                        onClick={() => choose(e)}
                                    >
                                        <Cover
                                            imageId={e.game.coverImageId}
                                            name={e.game.name}
                                            size="cover_big"
                                        />
                                        <span className="result__text">
                                            <strong>{e.game.name}</strong>
                                            <span className="muted">
                                                {[
                                                    yearOf(e.game.releaseDate),
                                                    e.platforms.map(platformLabel).join(', ')
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </span>
                                        </span>
                                        {e.queued && <span className="badge">queued</span>}
                                        {e.slotId !== null ? (
                                            <span className="badge badge--playing">
                                                in {slotName(e.slotId) ?? 'a slot'}
                                            </span>
                                        ) : (
                                            e.status !== 'unplayed' && (
                                                <span className={`badge badge--${e.status}`}>
                                                    {e.status}
                                                </span>
                                            )
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
