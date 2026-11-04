import { coverUrl, type EntryDto } from '@gamequeue/shared';
import { useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useEntryAction } from '../api/collection';
import { hueOf } from '../collectionModel';
import { formatDate, formatMinutes } from '../lib';
import { ActionMenu } from './ActionMenu';
import { Cover } from './Cover';
import { AddPost } from './Journal';
import { PlatformTags } from './PlatformIcon';
import { CloseFlow } from './PlaythroughPanels';
import { celebrate } from './motion';
import { useEntryLink } from '../pageTransitions';
import { Ban, Check, NotebookPen, Pause, Play } from 'lucide-react';

/** Close flows (finish dialog, abandon form) shared by the hero and the paused card. */
function useClosing(entry: EntryDto) {
    const act = useEntryAction(entry.id);
    const [closing, setClosing] = useState<'finish' | 'abandon' | null>(null);
    const node = useRef<HTMLLIElement>(null);
    const flow = closing && (
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
                            if (closing === 'finish') celebrate(node.current);
                            setClosing(null);
                        }
                    }
                )
            }
            onCancel={() => setClosing(null)}
        />
    );
    return { act, setClosing, node, flow };
}

function Since({ entry }: { entry: EntryDto }) {
    const open = entry.openPlaythrough;
    return (
        <>
            {open?.startedOn ? `Since ${formatDate(open.startedOn)}` : 'In progress'}
            {open?.platform && (
                <>
                    {' · '}
                    <PlatformTags platforms={[open.platform]} />
                </>
            )}
        </>
    );
}

/**
 * A game being played: a hero card tinted from its cover. The primary button is "Add journal
 * entry" (the app has no sessions; the journal is where hours are logged), Pause and Mark finished
 * are outlined, and Abandon lives in the ••• menu. Hours and time to beat show only when known.
 */
export function PlayingCard({ entry }: { entry: EntryDto }) {
    const { act, setClosing, node, flow } = useClosing(entry);
    const link = useEntryLink(entry);
    const [journaling, setJournaling] = useState(false);
    const open = entry.openPlaythrough;
    const logged = open?.loggedMinutes ?? 0;
    const busy = act.isPending;
    const { game } = entry;

    return (
        <li className="play-hero" ref={node}>
            <div className="play-hero__bg" aria-hidden="true">
                {game.coverImageId ? (
                    <img src={coverUrl(game.coverImageId, 'cover_big')} alt="" />
                ) : (
                    <span style={{ '--hue': hueOf(game.name) } as CSSProperties} />
                )}
            </div>
            <div className="play-hero__game">
                <Link
                    to={link.to}
                    onClick={link.onClick}
                    className="play-hero__cover"
                    aria-label={`Open ${game.name}`}
                >
                    <Cover
                        imageId={game.coverImageId}
                        name={game.name}
                        size="720p"
                        transitionName={link.coverTransition}
                    />
                </Link>
                <div className="play-hero__body">
                    <div>
                        <Link to={link.to} onClick={link.onClick} className="play-hero__title">
                            {game.name}
                        </Link>
                        <p className="play-hero__meta">
                            <Since entry={entry} />
                        </p>
                        {(logged > 0 || entry.ttbMinutes !== null) && (
                            <p className="play-hero__meta">
                                {[
                                    logged > 0 ? `${formatMinutes(logged)} logged` : null,
                                    entry.ttbMinutes !== null
                                        ? `About ${formatMinutes(entry.ttbMinutes)} to beat`
                                        : null
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        )}
                    </div>
                    <div className="play-hero__actions">
                        {open && (
                            <button
                                className="btn btn--primary"
                                aria-expanded={journaling}
                                onClick={() => setJournaling((j) => !j)}
                            >
                                <NotebookPen aria-hidden="true" />
                                Add journal entry
                            </button>
                        )}
                        <button
                            className="btn"
                            disabled={busy}
                            onClick={() => act.mutate({ action: 'pause' })}
                        >
                            <Pause aria-hidden="true" />
                            Pause
                        </button>
                        <button className="btn" onClick={() => setClosing('finish')}>
                            <Check aria-hidden="true" />
                            Mark finished
                        </button>
                        <ActionMenu label={`More actions for ${game.name}`}>
                            <button
                                type="button"
                                className="amenu__item amenu__item--danger"
                                onClick={() => setClosing('abandon')}
                            >
                                <Ban aria-hidden="true" /> Abandon
                            </button>
                        </ActionMenu>
                    </div>
                </div>
            </div>
            {journaling && open && (
                <div className="play-hero__journal">
                    <AddPost playthroughId={open.id} />
                </div>
            )}
            {flow}
        </li>
    );
}

/** A paused game in the small side card: Resume, with Mark finished and Abandon in the ••• menu. */
export function PausedCard({ entry }: { entry: EntryDto }) {
    const { act, setClosing, node, flow } = useClosing(entry);
    const link = useEntryLink(entry);
    const { game } = entry;
    return (
        <li className="paused-card" ref={node}>
            <div className="paused-card__game">
                <Link
                    to={link.to}
                    onClick={link.onClick}
                    className="paused-card__cover"
                    aria-label={`Open ${game.name}`}
                >
                    <Cover
                        imageId={game.coverImageId}
                        name={game.name}
                        transitionName={link.coverTransition}
                    />
                </Link>
                <div className="paused-card__body">
                    <Link to={link.to} onClick={link.onClick} className="paused-card__title">
                        {game.name}
                    </Link>
                    <p className="muted paused-card__meta">
                        <Since entry={entry} />
                    </p>
                </div>
            </div>
            <div className="paused-card__actions">
                <button
                    className="btn btn--primary"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ action: 'resume' })}
                >
                    <Play aria-hidden="true" />
                    Resume
                </button>
                <ActionMenu label={`More actions for ${game.name}`}>
                    <button
                        type="button"
                        className="amenu__item"
                        onClick={() => setClosing('finish')}
                    >
                        <Check aria-hidden="true" /> Mark finished
                    </button>
                    <button
                        type="button"
                        className="amenu__item amenu__item--danger"
                        onClick={() => setClosing('abandon')}
                    >
                        <Ban aria-hidden="true" /> Abandon
                    </button>
                </ActionMenu>
            </div>
            {flow}
        </li>
    );
}
