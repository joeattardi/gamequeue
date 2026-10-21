import { screenshotUrl } from '@gamequeue/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { useModalDialog } from './useModalDialog';

const SHOWN = 4;

/** A few screenshots under the cover; a click opens them full size, where all of them can be paged. */
export function Screenshots({ imageIds, name }: { imageIds: string[]; name: string }) {
    const [open, setOpen] = useState<number | null>(null);
    if (imageIds.length === 0) return null;
    return (
        <>
            <ul className="shots" aria-label={`${name} screenshots`}>
                {imageIds.slice(0, SHOWN).map((id, i) => (
                    <li key={id}>
                        <button
                            className="shots__thumb"
                            onClick={() => setOpen(i)}
                            aria-label={`View screenshot ${i + 1} of ${imageIds.length}`}
                        >
                            <img
                                src={screenshotUrl(id, 'screenshot_med')}
                                alt=""
                                loading="lazy"
                                width={569}
                                height={320}
                            />
                        </button>
                    </li>
                ))}
            </ul>
            <Lightbox
                imageIds={imageIds}
                name={name}
                index={open}
                onIndex={setOpen}
                onClose={() => setOpen(null)}
            />
        </>
    );
}

function Lightbox({
    imageIds,
    name,
    index,
    onIndex,
    onClose
}: {
    imageIds: string[];
    name: string;
    index: number | null;
    onIndex: (i: number) => void;
    onClose: () => void;
}) {
    const ref = useModalDialog(index !== null);
    const count = imageIds.length;
    const step = (by: number) => index !== null && onIndex((index + by + count) % count);
    return (
        <dialog
            ref={ref}
            className="dialog dialog--shots"
            aria-label={`${name} screenshots`}
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') step(-1);
                if (e.key === 'ArrowRight') step(1);
            }}
        >
            {index !== null && (
                <div className="shots__view">
                    <img
                        src={screenshotUrl(imageIds[index]!, '1080p')}
                        alt={`${name} screenshot ${index + 1} of ${count}`}
                    />
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
