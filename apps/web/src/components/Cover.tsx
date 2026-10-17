import { coverUrl, type CoverSize } from "@gamequeue/shared";

/** Cover art with a typographic fallback for games IGDB has no image for. */
export function Cover({ imageId, name, size = "cover_big" }: { imageId: string | null; name: string; size?: CoverSize }) {
  if (!imageId)
    return (
      <div className="cover cover--empty" role="img" aria-label={`${name} (no cover)`}>
        <span aria-hidden="true">{name}</span>
      </div>
    );
  return <img className="cover" src={coverUrl(imageId, size)} alt={`${name} cover`} loading="lazy" width={264} height={352} />;
}
