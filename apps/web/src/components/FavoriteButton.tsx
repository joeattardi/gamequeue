import { Heart } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

const BURST = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Heart toggle; shown as already switched while the save is in flight. Switching it on pops the
 * heart and throws a ring of dots (keyed by the click, so each click replays it; CSS only).
 */
export function FavoriteButton({
    favorite,
    onToggle
}: {
    favorite: boolean;
    onToggle: (favorite: boolean) => void;
}) {
    const [pops, setPops] = useState(0);
    const popping = favorite && pops > 0;
    return (
        <button
            type="button"
            className={`favorite-btn${popping ? ' favorite-btn--pop' : ''}`}
            aria-pressed={favorite}
            aria-label="Favorite"
            title={favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => {
                if (!favorite) setPops((n) => n + 1);
                onToggle(!favorite);
            }}
        >
            <Heart key={pops} aria-hidden="true" />
            {popping && (
                <span key={pops} className="favorite-burst" aria-hidden="true">
                    {BURST.map((k) => (
                        <i key={k} style={{ '--k': k } as CSSProperties} />
                    ))}
                </span>
            )}
        </button>
    );
}
