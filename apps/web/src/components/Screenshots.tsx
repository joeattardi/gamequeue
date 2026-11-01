import { screenshotUrl } from '@gamequeue/shared';
import { useState } from 'react';
import { Lightbox } from './ImageLightbox';

const SHOWN = 3;

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
                            <img src={screenshotUrl(id, '720p')} alt="" loading="lazy" />
                        </button>
                    </li>
                ))}
            </ul>
            <Lightbox
                urls={imageIds.map((id) => screenshotUrl(id, '1080p'))}
                label={`${name} screenshots`}
                alt={(i) => `${name} screenshot ${i + 1} of ${imageIds.length}`}
                index={open}
                onIndex={setOpen}
                onClose={() => setOpen(null)}
            />
        </>
    );
}
