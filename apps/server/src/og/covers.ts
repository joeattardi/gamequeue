import { coverUrl } from '@gamequeue/shared';
import { LruCache } from './lru.js';

const TIMEOUT_MS = 4000;

/**
 * Cover art as `data:` URIs (satori can't fetch for itself in a way we control). A cover that can't be
 * fetched is `null` and the card draws a placeholder, so IGDB's CDN being slow never fails an image.
 * Failures aren't cached, so the next card tries again.
 */
export function createCoverLoader(fetchImpl: typeof fetch = fetch, maxCovers = 60) {
    const cache = new LruCache<string, string>(maxCovers);

    async function load(imageId: string): Promise<string | null> {
        const hit = cache.get(imageId);
        if (hit) return hit;
        try {
            const res = await fetchImpl(coverUrl(imageId, 'cover_big_2x'), {
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            if (!res.ok) return null;
            const uri = `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
            cache.set(imageId, uri);
            return uri;
        } catch {
            return null;
        }
    }

    return {
        /** Each id once, in parallel */
        async loadAll(imageIds: string[]): Promise<Map<string, string | null>> {
            const ids = [...new Set(imageIds)];
            const uris = await Promise.all(ids.map(load));
            return new Map(ids.map((id, i) => [id, uris[i]!]));
        }
    };
}
export type CoverLoader = ReturnType<typeof createCoverLoader>;
