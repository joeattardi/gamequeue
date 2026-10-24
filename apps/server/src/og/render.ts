import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    profileCard,
    recapCard,
    type CardAssets,
    type ProfileCardData,
    type RecapCardData
} from './cards.js';
import { gridCard, tierCard, type GridCardData, type TierCardData } from './social-cards.js';
import { createCoverLoader, type CoverLoader } from './covers.js';
import { loadFonts } from './fonts.js';
import { LruCache } from './lru.js';

export interface UploadedAvatar {
    contentType: string;
    data: Buffer;
}

/**
 * Uploaded avatars are mostly WebP, which resvg can't draw (it silently leaves the frame empty). Everything
 * goes through sharp to a small PNG, which also means a corrupt upload just falls back to the identicon.
 */
export async function avatarDataUri(avatar: UploadedAvatar | null): Promise<string | null> {
    if (!avatar) return null;
    try {
        const png = await sharp(avatar.data).resize(192, 192, { fit: 'cover' }).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
        return null;
    }
}

export type CardRequest =
    | { data: ProfileCardData; avatar: UploadedAvatar | null }
    | { data: RecapCardData; avatar: UploadedAvatar | null }
    | { data: GridCardData; avatar: UploadedAvatar | null }
    | { data: TierCardData; avatar: UploadedAvatar | null };

/** A card is 250-700 KB (cover art and gradients don't compress), so 32 of them stay around 20 MB. */
const MAX_CARDS = 32;

export function createCardRenderer(deps: { fetch?: typeof fetch; covers?: CoverLoader } = {}) {
    const covers = deps.covers ?? createCoverLoader(deps.fetch);
    const done = new LruCache<string, Buffer>(MAX_CARDS);
    // Discord, Twitter and Slack all unfurl a fresh link at about the same moment: one render serves them all
    const inFlight = new Map<string, Promise<Buffer>>();

    async function draw(req: CardRequest): Promise<Buffer> {
        const { data } = req;
        const [coverUris, avatar] = await Promise.all([
            // Grids and tier lists show many small covers; the others a few big ones
            covers.loadAll(data.covers, 'kind' in data ? 'cover_small_2x' : 'cover_big_2x'),
            avatarDataUri(req.avatar)
        ]);
        const assets: CardAssets = { covers: coverUris, avatar };
        const element =
            'kind' in data
                ? data.kind === 'grid'
                    ? gridCard(data, assets)
                    : tierCard(data, assets)
                : 'year' in data
                  ? recapCard(data, assets)
                  : profileCard(data, assets);
        const svg = await satori(element as unknown as Parameters<typeof satori>[0], {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            fonts: loadFonts()
        });
        return Buffer.from(
            new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng()
        );
    }

    return {
        /** `key` must change whenever anything the card shows changes (see `cardKey`) */
        async render(key: string, req: CardRequest): Promise<Buffer> {
            const hit = done.get(key);
            if (hit) return hit;
            let pending = inFlight.get(key);
            if (!pending) {
                pending = draw(req)
                    .then((png) => {
                        done.set(key, png);
                        return png;
                    })
                    .finally(() => inFlight.delete(key));
                inFlight.set(key, pending);
            }
            return pending;
        }
    };
}
export type CardRenderer = ReturnType<typeof createCardRenderer>;
