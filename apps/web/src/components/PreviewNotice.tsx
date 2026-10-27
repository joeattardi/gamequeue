import { FlaskConical } from 'lucide-react';

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
