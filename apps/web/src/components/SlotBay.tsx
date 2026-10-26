import type { EntryDto, SlotDto } from '@gamequeue/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useEntryAction } from '../api/collection';
import { useClearSlot } from '../api/slots';
import { daysBetween, formatDate, todayLocal } from '../lib';
import { PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { celebrate } from './motion';
import { useEntryLink } from '../pageTransitions';
import { CloseForm } from './PlaythroughPanels';
import { ArrowLeftRight, Ban, Check, Dices, Eraser, Gamepad2, Pause, Play } from 'lucide-react';

export function SlotBay({ slot, onChoose }: { slot: SlotDto; onChoose: (slot: SlotDto) => void }) {
    const entry = slot.entry;
    const act = useEntryAction(entry?.id ?? 0);
    const clear = useClearSlot();
    const [closing, setClosing] = useState<'finish' | 'abandon' | null>(null);
    const busy = act.isPending || clear.isPending;
    const bay = useRef<HTMLLIElement>(null);

    if (!entry) {
        return (
            <li className="bay bay--empty">
                <h2 className="bay__name">{slot.name}</h2>
                <p className="muted">Empty</p>
                <div className="row">
                    <button className="btn btn--primary" onClick={() => onChoose(slot)}>
                        <Gamepad2 />
                        Choose a game
                    </button>
                    <Link className="btn" to="/pick">
                        <Dices />
                        Random pick
                    </Link>
                </div>
            </li>
        );
    }

    const open = entry.openPlaythrough;
    // Only a game being played glows; a paused one keeps its slot but sits quiet
    const live = entry.status === 'playing';
    const daysIn = live ? daysBetween(open?.startedOn ?? null, todayLocal()) : null;
    return (
        <li className={`bay${live ? ' bay--live' : ''}`} ref={bay}>
            <div className="bay__head">
                <h2 className="bay__name">{slot.name}</h2>
                {live && (
                    <span className="bay__live">
                        <i aria-hidden="true" />
                        Live
                        {daysIn !== null && daysIn > 0 && (
                            <span className="bay__days">
                                {' '}
                                · {daysIn} {daysIn === 1 ? 'day' : 'days'} in
                            </span>
                        )}
                    </span>
                )}
            </div>
            <div className="bay__game">
                <BayCover entry={entry} />
                <div className="stack">
                    <div>
                        <BayTitle entry={entry} />
                        <p className="muted bay__meta">
                            <span className={`badge badge--${entry.status}`}>{entry.status}</span>{' '}
                            {open && `since ${formatDate(open.startedOn)}`}
                            {open?.platform && (
                                <>
                                    {' · '}
                                    <PlatformTags platforms={[open.platform]} />
                                </>
                            )}
                        </p>
                    </div>
                    <div className="row">
                        {entry.status === 'playing' ? (
                            <button
                                className="btn"
                                disabled={busy}
                                onClick={() => act.mutate({ action: 'pause' })}
                            >
                                <Pause />
                                Pause
                            </button>
                        ) : (
                            <button
                                className="btn"
                                disabled={busy}
                                onClick={() => act.mutate({ action: 'resume' })}
                            >
                                <Play />
                                Resume
                            </button>
                        )}
                        <button className="btn btn--primary" onClick={() => setClosing('finish')}>
                            <Check />
                            Finished
                        </button>
                        <button className="btn btn--ghost" onClick={() => setClosing('abandon')}>
                            <Ban />
                            Abandon
                        </button>
                    </div>
                </div>
            </div>
            {closing && (
                <CloseForm
                    key={closing}
                    mode={closing}
                    pending={act.isPending}
                    onSubmit={(body) =>
                        act.mutate(
                            { action: closing, body },
                            {
                                onSuccess: () => {
                                    // Measured now: the bay empties once the slots refetch
                                    if (closing === 'finish') celebrate(bay.current);
                                    setClosing(null);
                                }
                            }
                        )
                    }
                    onCancel={() => setClosing(null)}
                />
            )}
            <div className="row bay__foot">
                <button className="btn btn--ghost" onClick={() => onChoose(slot)} disabled={busy}>
                    <ArrowLeftRight />
                    Swap…
                </button>
                <button
                    className="btn btn--ghost"
                    onClick={() => clear.mutate(slot.id)}
                    disabled={busy}
                    title="Pauses the game and frees the slot"
                >
                    <Eraser />
                    Clear slot
                </button>
            </div>
        </li>
    );
}

function BayCover({ entry }: { entry: EntryDto }) {
    const link = useEntryLink(entry);
    return (
        <Link
            to={link.to}
            onClick={link.onClick}
            className="bay__cover"
            aria-label={`Open ${entry.game.name}`}
        >
            <Cover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                transitionName={link.coverTransition}
            />
        </Link>
    );
}

function BayTitle({ entry }: { entry: EntryDto }) {
    const link = useEntryLink(entry);
    return (
        <Link to={link.to} onClick={link.onClick} className="bay__title">
            {entry.game.name}
        </Link>
    );
}
