/**
 * IGDB image sizes we use (covers are 3:4). Measured on a real cover:
 * cover_small 90x120, cover_small_2x 180x240, cover_big 264x352, cover_big_2x 528x704,
 * 720p 540x720, 1080p 810x1080.
 */
export type CoverSize =
    'thumb' | 'cover_small' | 'cover_small_2x' | 'cover_big' | 'cover_big_2x' | '720p' | '1080p';

const BASE = 'https://images.igdb.com/igdb/image/upload';

/** IGDB serves images by image_id; we only ever store the id. */
export const coverUrl = (imageId: string, size: CoverSize = 'cover_big') =>
    `${BASE}/t_${size}/${imageId}.jpg`;

/** The next size up, for screens with a higher pixel density. */
const RETINA: Partial<Record<CoverSize, CoverSize>> = {
    cover_small: 'cover_small_2x',
    cover_big: 'cover_big_2x',
    '720p': '1080p'
};

/** `srcset` so high-density screens get a sharper image while others keep the small download. */
export function coverSrcSet(imageId: string, size: CoverSize = 'cover_big'): string | undefined {
    const retina = RETINA[size];
    return retina ? `${coverUrl(imageId, size)} 1x, ${coverUrl(imageId, retina)} 2x` : undefined;
}
