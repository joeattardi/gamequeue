import { Check, ChevronDown, Copy, House, Power, RotateCw } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, useRouteError } from 'react-router';

/** What to show a developer: the message and, when there is one, the stack. */
function describe(error: unknown): string {
    if (error instanceof Error) {
        const head = `${error.name}: ${error.message}`;
        // Chrome's stack already starts with that line; Safari's and Firefox's do not
        return error.stack?.includes(error.message)
            ? error.stack
            : [head, error.stack].join('\n\n');
    }
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error, null, 2) ?? String(error);
    } catch {
        return String(error);
    }
}

/** One arc of the ring: centred on `deg` (0 = right, clockwise), `span` degrees wide. */
function arc(deg: number, span: number, r: number, c: number): string {
    const point = (a: number) => {
        const rad = (a * Math.PI) / 180;
        return `${(c + r * Math.cos(rad)).toFixed(2)} ${(c + r * Math.sin(rad)).toFixed(2)}`;
    };
    return `M${point(deg - span / 2)}A${r} ${r} 0 0 1 ${point(deg + span / 2)}`;
}

/** A nod to an old console's "red ring of death": four quadrants, three of them lit red. */
const RING = [
    { deg: -135, lit: false },
    { deg: -45, lit: true },
    { deg: 45, lit: true },
    { deg: 135, lit: true }
].map((q) => ({ ...q, d: arc(q.deg, 66, 68, 74) }));

/**
 * Shown when something throws while rendering. `page` sits inside the app's layout (the sidebar is
 * still there, only the page area failed); `full` is the last resort for when nothing could be
 * drawn, so it takes the whole window and relies on nothing but plain links and the stylesheet.
 */
export function ErrorPage({ error, variant }: { error: unknown; variant: 'page' | 'full' }) {
    const [showDetails, setShowDetails] = useState(false);
    const [copied, setCopied] = useState(false);
    const details = describe(error);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(details);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // No clipboard access: the text is selectable on screen
        }
    };

    return (
        <div className={`error-page error-page--${variant}`} role="alert">
            <div className="error-card">
                <span className="error-card__ring" aria-hidden="true">
                    <svg viewBox="0 0 148 148">
                        {RING.map((q, i) => (
                            <path
                                key={i}
                                d={q.d}
                                className={q.lit ? 'ring-arc ring-arc--lit' : 'ring-arc'}
                                style={{ '--n': i } as CSSProperties}
                            />
                        ))}
                    </svg>
                    <span className="error-card__mark">
                        <Power />
                    </span>
                </span>
                <h1>Something went wrong</h1>
                <p>
                    GameQueue ran into an unexpected problem and couldn&rsquo;t show this page. Your
                    games and lists are safe. Reloading usually fixes it, or you can head back home.
                </p>
                <div className="error-card__actions">
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => window.location.reload()}
                    >
                        <RotateCw />
                        Reload page
                    </button>
                    {variant === 'page' ? (
                        <Link className="btn" to="/">
                            <House />
                            Go home
                        </Link>
                    ) : (
                        // A full page load: nothing in the app can be trusted to still work
                        <a className="btn" href="/">
                            <House />
                            Go home
                        </a>
                    )}
                </div>
                <button
                    type="button"
                    className="error-card__toggle"
                    aria-expanded={showDetails}
                    aria-controls="error-details"
                    onClick={() => setShowDetails((s) => !s)}
                >
                    <ChevronDown aria-hidden="true" />
                    {showDetails ? 'Hide details' : 'Show details'}
                </button>
                <div id="error-details" className="error-card__details" hidden={!showDetails}>
                    <pre tabIndex={0}>{details}</pre>
                    <button type="button" className="btn btn--ghost" onClick={copy}>
                        {copied ? <Check /> : <Copy />}
                        {copied ? 'Copied' : 'Copy details'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** The router's `errorElement`: the last resort for anything the page-level boundary didn't catch. */
export function RouteErrorPage() {
    return <ErrorPage error={useRouteError()} variant="full" />;
}
