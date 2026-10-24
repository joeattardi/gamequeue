import type { GridDto } from '@gamequeue/shared';
import { renderGridImage } from '../gridImage';
import { imageFilename } from '../shareImage';
import { DownloadImageButton } from './DownloadImageButton';

/** Draws the grid as a JPEG (title, labels, names, branding) and saves it. */
export function DownloadGridImage({
    grid,
    username
}: {
    grid: Pick<GridDto, 'title' | 'description' | 'cols' | 'rows' | 'cells'>;
    username?: string;
}) {
    return (
        <DownloadImageButton
            render={() => renderGridImage(grid, username)}
            filename={imageFilename(grid.title, 'grid')}
        />
    );
}
