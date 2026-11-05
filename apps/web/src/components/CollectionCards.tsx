import type { EntryDto } from '@gamequeue/shared';
import { Heart, Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router';
import { useEntryAction } from '../api/collection';
import { useAddToQueue } from '../api/queue';
import { canQueue, entryMetaParts, hueOf, platformText, quickAction } from '../collectionModel';
import { yearOf } from '../lib';
import { useEntryLink } from '../pageTransitions';
import { statusColorOnCover, statusText } from '../statusColor';
import { Cover } from './Cover';
import { EntryStatusChip } from './StatusChip';
import { StartPlayingButton } from './StartPlayingButton';
import { useToast } from './Toast';

const stateLabel = (entry: EntryDto) =>
    entry.status === 'unplayed' && entry.queued ? 'Up next' : statusText(entry.status);

/** Cover art, or for a game IGDB has none for, its name as typography on a gradient (so no tile is blank). */
function Art({ entry, transitionName }: { entry: EntryDto; transitionName?: string }) {
    const { game } = entry;
    if (game.coverImageId)
        return (
            <Cover imageId={game.coverImageId} name={game.name} transitionName={transitionName} />
        );
    return (
        <span
            className="wall__fallback"
            style={{ '--hue': hueOf(game.name) } as never}
            role="img"
            aria-label={`${game.name} (no cover)`}
        >
            <span aria-hidden="true">{game.name}</span>
        </span>
    );
}

/** Grid: the cover with its status chip, then the title and one meta line. Details never wait on a hover. */
export const CollectionCard = memo(function CollectionCard({ entry }: { entry: EntryDto }) {
    const link = useEntryLink(entry);
    const meta = entryMetaParts(entry).join(' · ');
    return (
        <li className="ccard">
            <Link to={link.to} onClick={link.onClick} className="ccard__link">
                <span className="ccard__art">
                    <Art entry={entry} transitionName={link.coverTransition} />
                    <EntryStatusChip entry={entry} onCover className="ccard__chip" />
                    {entry.favorite && (
                        <span className="ccard__fav" title="Favorite">
                            <Heart aria-hidden="true" />
                            <span className="sr-only">Favorite</span>
                        </span>
                    )}
                </span>
                <span className="ccard__title">{entry.game.name}</span>
                {meta && <span className="ccard__meta">{meta}</span>}
            </Link>
        </li>
    );
});

/** List: everything about a game on one row. */
export const CollectionRow = memo(function CollectionRow({ entry }: { entry: EntryDto }) {
    const link = useEntryLink(entry);
    const { game } = entry;
    const sub = [yearOf(game.releaseDate), platformText(entry.platforms), game.genres[0]]
        .filter(Boolean)
        .join(' · ');
    const facts = entryMetaParts(entry).slice(1);
    return (
        <li>
            <Link to={link.to} onClick={link.onClick} className="crow">
                <span className="crow__cover">
                    <Cover
                        imageId={game.coverImageId}
                        name={game.name}
                        size="cover_small"
                        transitionName={link.coverTransition}
                    />
                </span>
                <span className="crow__text">
                    <span className="crow__title">{game.name}</span>
                    {sub && <span className="crow__sub">{sub}</span>}
                    {facts.length > 0 && <span className="crow__sub">{facts.join(' · ')}</span>}
                </span>
                {entry.favorite && (
                    <span className="crow__fav" title="Favorite">
                        <Heart aria-hidden="true" />
                        <span className="sr-only">Favorite</span>
                    </span>
                )}
                <EntryStatusChip entry={entry} className="crow__chip" />
            </Link>
        </li>
    );
});

/**
 * Wall: art only, edge to edge, with a 4px status bar along the bottom that never hides. Title,
 * platform, status and a quick action show on hover and on keyboard focus. The tile is a link; the
 * actions sit in a sibling layer (never a button inside the link) that appears with `:hover` and
 * `:focus-within`, so keyboard users get the same details.
 */
export const WallTile = memo(function WallTile({ entry }: { entry: EntryDto }) {
    const link = useEntryLink(entry);
    const { game } = entry;
    const state = stateLabel(entry);
    const platform = platformText(entry.platforms);
    // The quick actions need a few mutation hooks; with thousands of tiles they are only set up
    // once the tile is hovered or focused (the user can't reach them any sooner)
    const [armed, setArmed] = useState(false);
    return (
        <li
            className="wall__tile"
            style={{ '--bar': statusColorOnCover(entry.status) } as never}
            onPointerEnter={() => setArmed(true)}
            onFocus={() => setArmed(true)}
        >
            <Link
                to={link.to}
                onClick={link.onClick}
                className="wall__link"
                aria-label={[game.name, state, platform].filter(Boolean).join(', ')}
            >
                <Art entry={entry} transitionName={link.coverTransition} />
                <span className="wall__bar" aria-hidden="true" />
            </Link>
            <div className="wall__over">
                <strong className="wall__title">{game.name}</strong>
                <span className="wall__meta">
                    <span className="wall__dot" aria-hidden="true" />
                    {[platform, state].filter(Boolean).join(' · ')}
                </span>
                {armed && <WallActions entry={entry} to={link.to} />}
            </div>
        </li>
    );
});

function WallActions({ entry, to }: { entry: EntryDto; to: string }) {
    const kind = quickAction(entry.status);
    const resume = useEntryAction(entry.id);
    const queue = useAddToQueue();
    const toast = useToast();
    return (
        <span className="wall__actions">
            {(kind === 'start' || kind === 'again') && (
                <StartPlayingButton
                    entry={entry}
                    className="wall__act wall__act--primary"
                    label={kind === 'start' ? 'Start' : 'Play again'}
                />
            )}
            {kind === 'continue' && (
                <Link to={to} className="wall__act wall__act--primary">
                    Continue
                </Link>
            )}
            {kind === 'resume' && (
                <button
                    type="button"
                    className="wall__act wall__act--primary"
                    disabled={resume.isPending}
                    onClick={() => resume.mutate({ action: 'resume' })}
                >
                    Resume
                </button>
            )}
            {canQueue(entry) && (
                <button
                    type="button"
                    className="wall__act wall__plus"
                    aria-label={`Add ${entry.game.name} to your queue`}
                    title="Add to queue"
                    disabled={queue.isPending}
                    onClick={() =>
                        queue.mutate(entry.game.id, {
                            onSuccess: () =>
                                toast({ message: `${entry.game.name} added to your queue` })
                        })
                    }
                >
                    <Plus aria-hidden="true" />
                </button>
            )}
        </span>
    );
}
