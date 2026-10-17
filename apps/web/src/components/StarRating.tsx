import { Star } from 'lucide-react';
import { useId, useState } from 'react';
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
                            onMouseEnter={() => setHover(n)}
                        >
                            <input
                                type="radio"
                                name={name}
                                className="sr-only"
                                checked={value === n}
                                onChange={() => onChange(n)}
                                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                            />
                            <Star />
                        </label>
                    ))}
                </div>
                {value !== null ? (
                    <button
                        type="button"
                        className="btn btn--ghost stars__clear"
                        onClick={() => onChange(null)}
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
