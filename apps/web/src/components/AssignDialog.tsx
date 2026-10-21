import { ResultListSkeleton } from './ResultSkeletons';
import type { EntryDto, SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { useSlotCandidates } from '../api/collection';
import { needsPlatform, useSlots } from '../api/slots';
import { useDebounced, yearOf } from '../lib';
import { LoadMore } from './LoadMore';
import { MetaLine } from './MetaLine';
import { PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { useAssign } from './useAssign';
import { useModalDialog } from './useModalDialog';
import { X } from 'lucide-react';

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
    const slots = useSlots();
    const { assignTo, pending, error } = useAssign();
    const [text, setText] = useState('');
    const [picked, setPicked] = useState<EntryDto>();
    const [platformId, setPlatformId] = useState('');

    // The server searches and orders: queue first, then in progress, then the backlog
    const found = useSlotCandidates(useDebounced(text.trim(), 250), slot.entry?.id);
    const candidates = found.items;
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
                    <X />
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
                    {found.isPending ? (
                        <ResultListSkeleton />
                    ) : candidates.length === 0 ? (
                        <p className="muted">
                            {text ? 'No matches.' : 'Nothing to choose from. Add some games first.'}
                        </p>
                    ) : (
                        <>
                            <ul className="results" aria-busy={found.isFetching}>
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
                                                    <MetaLine
                                                        parts={[
                                                            yearOf(e.game.releaseDate),
                                                            <PlatformTags
                                                                key="p"
                                                                platforms={e.platforms}
                                                            />
                                                        ]}
                                                    />
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
                            <LoadMore
                                shown={candidates.length}
                                total={found.total}
                                hasMore={found.hasNextPage}
                                loading={found.isFetchingNextPage}
                                failed={found.isFetchNextPageError}
                                onMore={() => found.fetchNextPage()}
                                skeleton={<ResultListSkeleton />}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}
