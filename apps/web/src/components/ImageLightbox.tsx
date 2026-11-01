import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useModalDialog } from './useModalDialog';

/** A modal full-size viewer for a set of pictures, paged with the arrow keys or the buttons. */
export function Lightbox({
    urls,
    label,
    alt,
    index,
    onIndex,
    onClose
}: {
    urls: string[];
    /** Names the dialog for screen readers */
    label: string;
    /** Alt text of the picture shown at this position */
    alt: (index: number) => string;
    index: number | null;
    onIndex: (i: number) => void;
    onClose: () => void;
}) {
    const ref = useModalDialog(index !== null);
    const count = urls.length;
    const step = (by: number) => index !== null && onIndex((index + by + count) % count);
    return (
        <dialog
            ref={ref}
            className="dialog dialog--shots"
            aria-label={label}
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') step(-1);
                if (e.key === 'ArrowRight') step(1);
            }}
        >
            {index !== null && (
                <div className="shots__view">
                    <img src={urls[index]!} alt={alt(index)} />
                    <button
                        className="btn btn--ghost shots__close"
                        onClick={onClose}
                        aria-label="Close"
                        data-autofocus
                        autoFocus
                    >
                        <X />
                    </button>
                    {count > 1 && (
                        <>
                            <button
                                className="btn btn--ghost shots__nav shots__nav--prev"
                                onClick={() => step(-1)}
                                aria-label="Previous screenshot"
                            >
                                <ChevronLeft />
                            </button>
                            <button
                                className="btn btn--ghost shots__nav shots__nav--next"
                                onClick={() => step(1)}
                                aria-label="Next screenshot"
                            >
                                <ChevronRight />
                            </button>
                        </>
                    )}
                </div>
            )}
        </dialog>
    );
}
