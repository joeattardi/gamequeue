import type { TierListDto } from '@gamequeue/shared';
import { imageFilename } from '../shareImage';
import { renderTierImage } from '../tierImage';
import { DownloadImageButton } from './DownloadImageButton';

/** Draws the tier list as a JPEG (title, coloured tiers, covers, branding) and saves it. */
export function DownloadTierImage({
    list,
    username
}: {
    list: Pick<TierListDto, 'title' | 'description' | 'tiers'>;
    username?: string;
}) {
    return (
        <DownloadImageButton
            render={() => renderTierImage(list, username)}
            filename={imageFilename(list.title, 'tier-list')}
        />
    );
}
