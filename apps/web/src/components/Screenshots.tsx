import { screenshotUrl } from '@gamequeue/shared';
import { useState } from 'react';
import { Lightbox } from './ImageLightbox';

/** Every screenshot IGDB has, as a row that scrolls sideways; a click opens them full size in the lightbox. */
export function Screenshots({ imageIds, name }: { imageIds: string[]; name: string }) {
    const [open, setOpen] = useState<number | null>(null);
    if (imageIds.length === 0) return null;
    return (
        <section aria-labelledby="shots-h" className="game-section">
            <div className="game-section__head">
                <h2 id="shots-h">Screenshots</h2>
                <span className="muted">Click to open</span>
            </div>
            <ul className="shots-row" aria-label={`${name} screenshots`}>
                {imageIds.map((id, i) => (
                    <li key={id}>
                        <button
                            type="button"
                            className="shots-row__thumb"
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
        </section>
    );
}
