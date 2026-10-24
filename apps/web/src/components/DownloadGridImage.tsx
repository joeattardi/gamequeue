import type { GridDto } from '@gamequeue/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { gridFilename, renderGridImage } from '../gridImage';

/** Draws the grid as a JPEG (title, labels, names, branding) and saves it. */
export function DownloadGridImage({
    grid,
    username
}: {
    grid: Pick<GridDto, 'title' | 'description' | 'cols' | 'rows' | 'cells'>;
    username?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    async function download() {
        setBusy(true);
        setError(undefined);
        try {
            const blob = await renderGridImage(grid, username);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = gridFilename(grid.title);
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch {
            setError("Couldn't create the image.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="download-image">
            <button type="button" className="btn" onClick={download} disabled={busy}>
                <Download />
                {busy ? 'Preparing image…' : 'Download image'}
            </button>
            <p className="form-error" role="alert">
                {error}
            </p>
        </div>
    );
}
