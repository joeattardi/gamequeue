import { coverUrl, type CoverSize } from '@gamequeue/shared';
import { LruCache } from './lru.js';

const TIMEOUT_MS = 4000;

/**
 * Cover art as `data:` URIs (satori can't fetch for itself in a way we control). A cover that can't be
 * fetched is `null` and the card draws a placeholder, so IGDB's CDN being slow never fails an image.
 * Failures aren't cached, so the next card tries again.
 */
export function createCoverLoader(fetchImpl: typeof fetch = fetch, maxCovers = 120) {
    const cache = new LruCache<string, string>(maxCovers);

    async function load(imageId: string, size: CoverSize): Promise<string | null> {
        const key = `${size}:${imageId}`;
        const hit = cache.get(key);
        if (hit) return hit;
        try {
            const res = await fetchImpl(coverUrl(imageId, size), {
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            if (!res.ok) return null;
            const uri = `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
            cache.set(key, uri);
            return uri;
        } catch {
            return null;
        }
    }

    return {
        /** Each id once, in parallel. Big covers for the few-cover cards, small ones for the dense ones. */
        async loadAll(
            imageIds: string[],
            size: CoverSize = 'cover_big_2x'
        ): Promise<Map<string, string | null>> {
            const ids = [...new Set(imageIds)];
            const uris = await Promise.all(ids.map((id) => load(id, size)));
            return new Map(ids.map((id, i) => [id, uris[i]!]));
        }
    };
}
export type CoverLoader = ReturnType<typeof createCoverLoader>;
