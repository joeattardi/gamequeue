import type { SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useEntryAction } from '../api/collection';
import { useClearSlot } from '../api/slots';
import { formatDate } from '../lib';
import { PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { CloseForm } from './PlaythroughPanels';
import { ArrowLeftRight, Ban, Check, Dices, Eraser, Gamepad2, Pause, Play } from 'lucide-react';

export function SlotBay({ slot, onChoose }: { slot: SlotDto; onChoose: (slot: SlotDto) => void }) {
    const entry = slot.entry;
    const act = useEntryAction(entry?.id ?? 0);
    const clear = useClearSlot();
    const [closing, setClosing] = useState<'finish' | 'abandon' | null>(null);
    const busy = act.isPending || clear.isPending;

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
    return (
        <li className="bay">
            <h2 className="bay__name">{slot.name}</h2>
            <div className="bay__game">
                <Link
                    to={`/games/${entry.id}`}
                    className="bay__cover"
                    aria-label={`Open ${entry.game.name}`}
                >
                    <Cover imageId={entry.game.coverImageId} name={entry.game.name} />
                </Link>
                <div className="stack">
                    <div>
                        <Link to={`/games/${entry.id}`} className="bay__title">
                            {entry.game.name}
                        </Link>
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
                        act.mutate({ action: closing, body }, { onSuccess: () => setClosing(null) })
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
