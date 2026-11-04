import type { SearchResultDto } from '@gamequeue/shared';
import { Check } from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useGameDetail } from '../api/collection';
import {
    ADD_AS_OPTIONS,
    useRecentPlatformIds,
    type AddAs,
    type QuickAddInput,
    type QuickAddResult
} from '../api/search';
import { defaultPlatformIds } from '../searchModel';
import { statusColor } from '../statusColor';
import { Cover } from './Cover';
import { ScorePill } from './SearchRows';
import { useModalDialog } from './useModalDialog';

const DOT: Record<AddAs, 'playing' | 'unplayed' | 'wishlist'> = {
    playing: 'playing',
    upnext: 'unplayed',
    notstarted: 'unplayed',
    wishlist: 'wishlist'
};

/**
 * The phone's quick-add: a bottom sheet to say where you own a game and how to add it. Closing it
 * (button, Esc, backdrop, or dragging the grabber down) changes nothing; adding calls `onAdd` and
 * closes, leaving the search behind it exactly as it was.
 */
export function QuickAddSheet({
    result,
    wishlisted,
    onClose,
    onAdd
}: {
    result: SearchResultDto | null;
    wishlisted: boolean;
    onClose: () => void;
    onAdd: (input: QuickAddInput) => Promise<QuickAddResult>;
}) {
    const ref = useModalDialog(result !== null);
    return (
        <dialog
            ref={ref}
            className="sheet"
            aria-labelledby="sheet-title"
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {result && (
                <SheetBody
                    key={result.igdbId}
                    game={result}
                    wishlisted={wishlisted}
                    onClose={onClose}
                    onAdd={onAdd}
                />
            )}
        </dialog>
    );
}

function SheetBody({
    game,
    wishlisted,
    onClose,
    onAdd
}: {
    game: SearchResultDto;
    wishlisted: boolean;
    onClose: () => void;
    onAdd: (input: QuickAddInput) => Promise<QuickAddResult>;
}) {
    const detail = useGameDetail(game.igdbId);
    const recent = useRecentPlatformIds();
    const [platforms, setPlatforms] = useState<number[] | null>(null);
    const [as, setAs] = useState<AddAs>('upnext');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    // The preselection waits for the user's latest platforms to load, unless they already chose
    const chosen = platforms ?? defaultPlatformIds(recent, game.platforms);
    const option = ADD_AS_OPTIONS.find((o) => o.value === as)!;
    const genre = detail.data?.game.genres[0];

    const toggle = (id: number) =>
        setPlatforms(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

    // Dragging the grabber down closes the sheet
    const drag = useRef<number | null>(null);
    const onDown = (e: PointerEvent) => {
        drag.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
        if (drag.current !== null && e.clientY - drag.current > 70) {
            drag.current = null;
            onClose();
        }
    };

    const submit = async () => {
        setError(undefined);
        setBusy(true);
        try {
            await onAdd({
                igdbId: game.igdbId,
                name: game.name,
                wishlisted,
                platformIds: chosen,
                as
            });
            onClose();
        } catch (e) {
            setError(e instanceof ApiRequestError ? e.message : "Couldn't add the game.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="sheet__body">
            <div
                className="sheet__grabber"
                aria-hidden="true"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
            />
            <div className="sheet__game">
                <div className="sheet__cover">
                    <Cover imageId={game.coverImageId} name={game.name} size="cover_big" />
                </div>
                <div className="sheet__info">
                    <h2 id="sheet-title">{game.name}</h2>
                    <p className="muted">{[game.year, genre].filter(Boolean).join(' · ')}</p>
                    <ScorePill score={game.igdbRating} />
                </div>
            </div>

            <h3 className="sheet__label" id="own-label">
                Where do you own it?
            </h3>
            {game.platforms.length === 0 ? (
                <p className="muted">
                    IGDB doesn't list a platform for this game. Open its page to pick one.
                </p>
            ) : (
                <div className="sheet__chips" role="group" aria-labelledby="own-label">
                    {game.platforms.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className="sheet__chip"
                            aria-pressed={chosen.includes(p.id)}
                            onClick={() => toggle(p.id)}
                        >
                            {chosen.includes(p.id) && <Check aria-hidden="true" />}
                            {p.abbreviation ?? p.name}
                        </button>
                    ))}
                </div>
            )}

            <h3 className="sheet__label" id="as-label">
                Add it as
            </h3>
            <div className="sheet__choices" role="radiogroup" aria-labelledby="as-label">
                {ADD_AS_OPTIONS.map((o) => (
                    <label key={o.value} className="sheet__choice" data-on={o.value === as}>
                        <input
                            type="radio"
                            name="add-as"
                            className="sr-only"
                            checked={o.value === as}
                            onChange={() => setAs(o.value)}
                        />
                        <span className="sheet__choice-title">
                            <span
                                className="sheet__dot"
                                style={{ background: statusColor(DOT[o.value]) }}
                                aria-hidden="true"
                            />
                            {o.label}
                        </span>
                        <span className="muted">{o.hint}</span>
                    </label>
                ))}
            </div>

            {error && (
                <p className="form-error" role="alert">
                    {error}
                </p>
            )}
            <button
                type="button"
                className="btn btn--primary sheet__submit"
                disabled={busy || (as !== 'wishlist' && chosen.length === 0)}
                onClick={submit}
            >
                {option.button}
            </button>
            <Link className="sheet__details" to={`/games/igdb/${game.igdbId}`} onClick={onClose}>
                View full details
            </Link>
        </div>
    );
}
