import { coverUrl, type EntryDto, type GameDto } from '@gamequeue/shared';
import { ArrowLeft, ListPlus, Check, Play, Trash2 } from 'lucide-react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useEntryAction, useLogPlaythrough } from '../api/collection';
import { useAddToQueue, useRemoveFromQueue } from '../api/queue';
import { hueOf, platformText } from '../collectionModel';
import { TIER_LABELS, gaugePercent, gaugeTier } from '../gauge';
import { formatMinutes, todayLocal, yearOf } from '../lib';
import { COVER_TRANSITION } from '../pageTransitions';
import { primaryAction, type Move } from '../statusMoves';
import { ActionMenu } from './ActionMenu';
import { Cover } from './Cover';
import { FavoriteButton } from './FavoriteButton';
import { AskAboutGame } from './GameChat';
import { celebrate } from './motion';
import { CloseFlow } from './PlaythroughPanels';
import { ScoreGauge } from './ScoreGauge';
import { SeriesLinks } from './SeriesLinks';
import { EntryStatusChip } from './StatusChip';
import { StatusControl } from './StatusControl';

/** The cover, blurred and enlarged behind the hero, so every game gets its own colours. */
function Backdrop({ game }: { game: GameDto }) {
    return (
        <div className="game-hero__bg" aria-hidden="true">
            {game.coverImageId ? (
                <img src={coverUrl(game.coverImageId, 'cover_big')} alt="" />
            ) : (
                <span style={{ '--hue': hueOf(game.name) } as CSSProperties} />
            )}
        </div>
    );
}

/** The few facts IGDB (and your copy) can back up. A fact with no data behind it is left out. */
function Facts({
    game,
    platformsLabel,
    platforms
}: {
    game: GameDto;
    platformsLabel: string;
    platforms: string;
}) {
    const normally = game.ttb?.normally ?? null;
    const tier = game.igdbRating !== null ? gaugeTier(gaugePercent(game.igdbRating, 100)) : null;
    if (tier === null && normally === null && !platforms) return null;
    return (
        <dl className="facts">
            {game.igdbRating !== null && tier && (
                <div className="facts__item facts__item--score">
                    <ScoreGauge value={game.igdbRating} label="IGDB" size={60} />
                    <div>
                        <dt>IGDB score</dt>
                        <dd className="facts__sub">{TIER_LABELS[tier]}</dd>
                    </div>
                </div>
            )}
            {normally !== null && (
                <div className="facts__item">
                    <dd className="facts__big">~{formatMinutes(normally)}</dd>
                    <dt>Time to beat</dt>
                </div>
            )}
            {platforms && (
                <div className="facts__item">
                    <dd className="facts__big">{platforms}</dd>
                    <dt>{platformsLabel}</dt>
                </div>
            )}
        </dl>
    );
}

/** The blurred-backdrop header shared by the owned and not-owned game pages. */
export function GameHero({
    game,
    backTo,
    backLabel,
    chip,
    platformsLabel,
    platforms,
    children
}: {
    game: GameDto;
    backTo: string;
    backLabel: string;
    chip?: ReactNode;
    platformsLabel: string;
    platforms: string;
    children: ReactNode;
}) {
    const meta = [yearOf(game.releaseDate), game.genres.slice(0, 2).join(', ')]
        .filter(Boolean)
        .join(' · ');
    return (
        <header className="game-hero">
            <Backdrop game={game} />
            <div className="game-hero__inner">
                <Link to={backTo} className="back">
                    <ArrowLeft aria-hidden="true" /> {backLabel}
                </Link>
                <div className="game-hero__grid">
                    <div className="game-hero__cover">
                        <Cover
                            imageId={game.coverImageId}
                            name={game.name}
                            size="720p"
                            transitionName={COVER_TRANSITION}
                        />
                    </div>
                    <div className="game-hero__info">
                        <div className="game-hero__eyebrow">
                            {chip}
                            {meta && <span>{meta}</span>}
                        </div>
                        <h1>{game.name}</h1>
                        <SeriesLinks series={game.series} />
                        <Facts game={game} platformsLabel={platformsLabel} platforms={platforms} />
                        {children}
                    </div>
                </div>
            </div>
        </header>
    );
}

const errorText = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

/**
 * The hero of a game in your collection: one contextual primary button (Start playing, Resume,
 * Mark finished, Play again), "Add to queue" as a secondary, the favorite heart, a ••• menu, and a
 * segmented control that moves the game to any status the app allows from here.
 */
export function EntryHero({
    entry,
    favorite,
    onFavorite,
    onRemove,
    removing
}: {
    entry: EntryDto;
    favorite: boolean;
    onFavorite: (favorite: boolean) => void;
    onRemove: () => void;
    removing: boolean;
}) {
    const hero = useRef<HTMLDivElement>(null);
    const act = useEntryAction(entry.id);
    const log = useLogPlaythrough(entry.id);
    const enqueue = useAddToQueue();
    const dequeue = useRemoveFromQueue();
    const [closing, setClosing] = useState<'finish' | 'abandon' | null>(null);
    // A game on several platforms needs to know which one before it can be started
    const [choosing, setChoosing] = useState<{ paused: boolean } | null>(null);
    const [platformId, setPlatformId] = useState('');
    const [error, setError] = useState<string>();
    const busy = act.isPending || log.isPending;
    const primary = primaryAction(entry.status);

    const start = (paused: boolean, platform?: number) => {
        setError(undefined);
        act.mutate(
            {
                action: 'start',
                body: {
                    date: todayLocal(),
                    ...(platform ? { platformId: platform } : {}),
                    ...(paused ? { paused: true } : {})
                }
            },
            {
                onSuccess: () => setChoosing(null),
                onError: (e) => setError(errorText(e))
            }
        );
    };

    const run = (move: Move) => {
        setError(undefined);
        setClosing(null);
        setChoosing(null);
        switch (move.kind) {
            case 'start':
                if (entry.platforms.length > 1) {
                    setPlatformId('');
                    setChoosing({ paused: move.paused });
                } else start(move.paused, entry.platforms[0]?.id);
                return;
            case 'pause':
            case 'resume':
                act.mutate({ action: move.kind }, { onError: (e) => setError(errorText(e)) });
                return;
            case 'finish':
            case 'abandon':
                setClosing(move.kind);
                return;
            case 'logAbandoned':
                log.mutate({ outcome: 'abandoned' }, { onError: (e) => setError(errorText(e)) });
                return;
        }
    };

    const queued = entry.queued;
    const canQueue = queued || entry.status !== 'playing';

    return (
        <GameHero
            game={entry.game}
            backTo="/collection"
            backLabel="Collection"
            chip={<EntryStatusChip entry={entry} />}
            platformsLabel="Owned on"
            platforms={platformText(entry.platforms)}
        >
            <div className="game-hero__actions" ref={hero}>
                <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={busy}
                    onClick={() => run(primary.move)}
                >
                    <Play aria-hidden="true" />
                    {primary.label}
                </button>
                {canQueue && (
                    <button
                        type="button"
                        className="btn btn--lg"
                        aria-pressed={queued}
                        disabled={enqueue.isPending || dequeue.isPending}
                        onClick={() =>
                            (queued ? dequeue : enqueue).mutate(entry.game.id, {
                                onError: (e) => setError(errorText(e))
                            })
                        }
                    >
                        {queued ? (
                            <>
                                <Check aria-hidden="true" /> On your queue
                            </>
                        ) : (
                            <>
                                <ListPlus aria-hidden="true" /> Add to queue
                            </>
                        )}
                    </button>
                )}
                <FavoriteButton favorite={favorite} onToggle={onFavorite} />
                <ActionMenu label="More actions">
                    <AskAboutGame entry={entry} />
                    <button
                        type="button"
                        className="amenu__item amenu__item--danger"
                        disabled={removing}
                        onClick={onRemove}
                    >
                        <Trash2 aria-hidden="true" /> Remove from collection
                    </button>
                </ActionMenu>
            </div>

            <StatusControl status={entry.status} busy={busy} onMove={run} />

            {choosing && (
                <form
                    className="hero-choose"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (platformId) start(choosing.paused, Number(platformId));
                    }}
                >
                    <label className="field">
                        <span>Which platform are you playing it on?</span>
                        <select
                            value={platformId}
                            onChange={(e) => setPlatformId(e.target.value)}
                            autoFocus
                        >
                            <option value="">Choose…</option>
                            {entry.platforms.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button className="btn btn--primary" disabled={!platformId || busy}>
                        {choosing.paused ? 'Start paused' : 'Start playing'}
                    </button>
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setChoosing(null)}
                    >
                        Cancel
                    </button>
                </form>
            )}
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
                                    if (closing === 'finish') celebrate(hero.current);
                                    setClosing(null);
                                },
                                onError: (e) => setError(errorText(e))
                            }
                        )
                    }
                    onCancel={() => setClosing(null)}
                />
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
        </GameHero>
    );
}
