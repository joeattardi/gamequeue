/**
 * IGDB image sizes we use (covers are 3:4). Measured on a real cover:
 * cover_small 90x120, cover_small_2x 180x240, cover_big 264x352, cover_big_2x 528x704,
 * 720p 540x720, 1080p 810x1080.
 */
export type CoverSize =
    'thumb' | 'cover_small' | 'cover_small_2x' | 'cover_big' | 'cover_big_2x' | '720p' | '1080p';

const BASE = 'https://images.igdb.com/igdb/image/upload';

/**
 * What an IGDB image_id looks like (every cover in the full IGDB dump is lowercase letters and digits,
 * at most 20 characters). Anything else is refused on import: the id ends up in `srcset`, where a
 * space or comma would add an image URL of the file author's choosing.
 */
export const IGDB_IMAGE_ID = /^[a-z0-9]{1,40}$/;

/** Encoded as a second guard: a stored id can never be more than one path segment of IGDB's CDN. */
const image = (size: string, imageId: string) =>
    `${BASE}/t_${size}/${encodeURIComponent(imageId)}.jpg`;

/** IGDB serves images by image_id; we only ever store the id. */
export const coverUrl = (imageId: string, size: CoverSize = 'cover_big') => image(size, imageId);

/**
 * `screenshot_*` sizes are cropped to 16:9 (`screenshot_med` is 569x320); `720p` and `1080p` keep the
 * screenshot's own proportions, which is not always 16:9.
 */
export type ScreenshotSize =
    'screenshot_med' | 'screenshot_big' | 'screenshot_huge' | '720p' | '1080p';

export const screenshotUrl = (imageId: string, size: ScreenshotSize = 'screenshot_big') =>
    image(size, imageId);

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
