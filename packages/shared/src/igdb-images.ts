export type CoverSize = 'thumb' | 'cover_small' | 'cover_big' | '720p';

/** IGDB serves images by image_id; we only ever store the id. */
export const coverUrl = (imageId: string, size: CoverSize = 'cover_big') =>
    `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
