import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

/** A public page's full URL with a copy button, for the pages people share. */
export function ShareLink({ path, label = 'Public link' }: { path: string; label?: string }) {
    const url = `${window.location.origin}${path}`;
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked: the field is selectable, so the link can still be copied by hand
        }
    }
    return (
        <div className="share-link">
            <label className="field">
                <span>{label}</span>
                <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-describedby="share-link-note"
                />
            </label>
            <button type="button" className="btn" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy link'}
            </button>
            <Link className="btn" to={path}>
                <ExternalLink />
                View
            </Link>
            <span id="share-link-note" className="sr-only" aria-live="polite">
                {copied ? 'Link copied' : ''}
            </span>
        </div>
    );
}
