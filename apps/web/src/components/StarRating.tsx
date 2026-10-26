import { Star } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { RATING_MAX } from '@gamequeue/shared';

const STARS = Array.from({ length: RATING_MAX }, (_, i) => i + 1);

/**
 * Whole-star rating input. A radio group underneath, so arrow keys, Tab and screen readers work
 * natively; the stars preview on hover. "Clear" is the way back to unrated.
 */
export function StarRating({
    value,
    onChange,
    label = 'Rating',
    disabled
}: {
    value: number | null;
    onChange: (v: number | null) => void;
    label?: string;
    disabled?: boolean;
}) {
    const name = useId();
    const [hover, setHover] = useState<number | null>(null);
    // The last pick, so its stars play a fill sweep; `n` restarts it on every pick. Kept here
    // rather than read from `value`, which may only change once the save comes back.
    const [sweep, setSweep] = useState<{ to: number; n: number } | null>(null);
    const shown = hover ?? value ?? 0;
    return (
        <fieldset className="field stars" disabled={disabled}>
            <legend>{label}</legend>
            <div className="stars__row">
                <div className="stars__group" onMouseLeave={() => setHover(null)}>
                    {STARS.map((n) => (
                        <label
                            key={n}
                            className="stars__star"
                            data-on={n <= shown}
                            data-sweep={sweep && n < sweep.to ? true : undefined}
                            data-chosen={sweep?.to === n ? true : undefined}
                            style={{ '--k': n - 1 } as CSSProperties}
                            onMouseEnter={() => setHover(n)}
                        >
                            <input
                                type="radio"
                                name={name}
                                className="sr-only"
                                checked={value === n}
                                onChange={() => {
                                    setSweep((s) => ({ to: n, n: (s?.n ?? 0) + 1 }));
                                    onChange(n);
                                }}
                                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                            />
                            <Star key={sweep && n <= sweep.to ? sweep.n : 0} />
                        </label>
                    ))}
                </div>
                {value !== null ? (
                    <button
                        type="button"
                        className="btn btn--ghost stars__clear"
                        onClick={() => {
                            setSweep(null);
                            onChange(null);
                        }}
                    >
                        Clear
                    </button>
                ) : (
                    <span className="muted">Not rated</span>
                )}
            </div>
        </fieldset>
    );
}

/** Read-only stars for showing someone's rating; the text lives in the label, the icons are decoration. */
export function StarDisplay({ value }: { value: number }) {
    return (
        <span
            className="star-display"
            role="img"
            aria-label={`Rated ${value} out of ${RATING_MAX} stars`}
        >
            {STARS.map((n) => (
                <Star key={n} aria-hidden="true" data-on={n <= value} />
            ))}
        </span>
    );
}
