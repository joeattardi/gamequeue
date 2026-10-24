import { Download } from 'lucide-react';
import { useState } from 'react';

/** Runs `render` to draw an image and saves it as `filename`. Shared by grids and tier lists. */
export function DownloadImageButton({
    render,
    filename
}: {
    render: () => Promise<Blob>;
    filename: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    async function download() {
        setBusy(true);
        setError(undefined);
        try {
            const blob = await render();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
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
