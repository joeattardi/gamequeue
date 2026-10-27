import { FlaskConical, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

const DISMISSED_KEY = 'gq.preview-notice.dismissed';

/** Tells visitors the site is a preview: things change and data can be lost. */
export function PreviewNotice({ compact = false }: { compact?: boolean }) {
    return (
        <aside className={`preview-notice${compact ? ' preview-notice--compact' : ''}`}>
            <FlaskConical aria-hidden="true" />
            <p>
                <strong>GameQueue is in preview.</strong> Features may change, and your data could
                be lost at any time. Export your data now and then to keep a copy.
            </p>
        </aside>
    );
}

/** The notice for signed-in users on the home page: closable, and stays closed on this browser. */
export function DismissiblePreviewNotice() {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(DISMISSED_KEY) === '1';
        } catch {
            return false;
        }
    });
    if (dismissed) return null;
    return (
        <aside className="preview-notice preview-notice--inline">
            <FlaskConical aria-hidden="true" />
            <p>
                <strong>GameQueue is in preview.</strong> Features may change, and your data could
                be lost at any time. <Link to="/data">Export a copy</Link> now and then.
            </p>
            <button
                type="button"
                className="btn btn--ghost preview-notice__close"
                aria-label="Dismiss preview notice"
                onClick={() => {
                    setDismissed(true);
                    try {
                        localStorage.setItem(DISMISSED_KEY, '1');
                    } catch {
                        // Private window or blocked storage: it just comes back next visit
                    }
                }}
            >
                <X aria-hidden="true" />
            </button>
        </aside>
    );
}
