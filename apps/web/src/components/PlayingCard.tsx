import type { EntryDto } from '@gamequeue/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useEntryAction } from '../api/collection';
import { formatDate } from '../lib';
import { PlatformTags } from './PlatformIcon';
import { Cover } from './Cover';
import { celebrate } from './motion';
import { useEntryLink } from '../pageTransitions';
import { CloseFlow } from './PlaythroughPanels';
import { Ban, Check, Pause, Play } from 'lucide-react';

/**
 * A game being played (glowing, with Pause / Finished / Abandon), or, with `compact`, a paused
 * one in the smaller row below (Resume / Finished / Abandon).
 */
export function PlayingCard({ entry, compact = false }: { entry: EntryDto; compact?: boolean }) {
    const act = useEntryAction(entry.id);
    const [closing, setClosing] = useState<'finish' | 'abandon' | null>(null);
    const card = useRef<HTMLLIElement>(null);
    const link = useEntryLink(entry);
    const busy = act.isPending;
    const open = entry.openPlaythrough;
    const live = entry.status === 'playing';

    return (
        <li
            className={`play-card${live ? ' play-card--live' : ''}${compact ? ' play-card--compact' : ''}`}
            ref={card}
        >
            <div className="play-card__game">
                <Link
                    to={link.to}
                    onClick={link.onClick}
                    className="play-card__cover"
                    aria-label={`Open ${entry.game.name}`}
                >
                    <Cover
                        imageId={entry.game.coverImageId}
                        name={entry.game.name}
                        transitionName={link.coverTransition}
                    />
                </Link>
                <div className="stack">
                    <div>
                        <div className="play-card__head">
                            <Link to={link.to} onClick={link.onClick} className="play-card__title">
                                {entry.game.name}
                            </Link>
                            {/* Decoration: the line below already says what the status is */}
                            {live && <Play className="play-card__live" aria-hidden="true" />}
                        </div>
                        <p className="muted play-card__meta">
                            {open?.startedOn
                                ? `Since ${formatDate(open.startedOn)}`
                                : 'In progress'}
                            {open?.platform && (
                                <>
                                    {' · '}
                                    <PlatformTags platforms={[open.platform]} />
                                </>
                            )}
                        </p>
                    </div>
                    <div className="row">
                        {live ? (
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
                                className="btn btn--primary"
                                disabled={busy}
                                onClick={() => act.mutate({ action: 'resume' })}
                            >
                                <Play />
                                Resume
                            </button>
                        )}
                        <button
                            className={live ? 'btn btn--primary' : 'btn'}
                            onClick={() => setClosing('finish')}
                        >
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
                <CloseFlow
                    key={closing}
                    mode={closing}
                    playthrough={entry.openPlaythrough}
                    pending={act.isPending}
                    onSubmit={(body) =>
                        act.mutate(
                            { action: closing, body },
                            {
                                onSuccess: () => {
                                    // Measured now: the card leaves once the list refetches
                                    if (closing === 'finish') celebrate(card.current);
                                    setClosing(null);
                                }
                            }
                        )
                    }
                    onCancel={() => setClosing(null)}
                />
            )}
        </li>
    );
}
