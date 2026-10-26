import { coverSrcSet, coverUrl, type CoverSize } from '@gamequeue/shared';

/** Cover art with a typographic fallback for games IGDB has no image for. */
export function Cover({
    imageId,
    name,
    size = 'cover_big',
    draggable,
    transitionName
}: {
    imageId: string | null;
    name: string;
    size?: CoverSize;
    draggable?: boolean;
    /** `view-transition-name`, for the cover morph between pages (`pageTransitions.ts`) */
    transitionName?: string;
}) {
    const style = transitionName ? { viewTransitionName: transitionName } : undefined;
    if (!imageId)
        return (
            <div
                className={`cover cover--empty${transitionName ? ' cover--morph' : ''}`}
                role="img"
                aria-label={`${name} (no cover)`}
                style={style}
            >
                <span aria-hidden="true">{name}</span>
            </div>
        );
    return (
        <img
            className={`cover${transitionName ? ' cover--morph' : ''}`}
            src={coverUrl(imageId, size)}
            srcSet={coverSrcSet(imageId, size)}
            alt={`${name} cover`}
            loading="lazy"
            width={264}
            height={352}
            draggable={draggable}
            style={style}
        />
    );
}
