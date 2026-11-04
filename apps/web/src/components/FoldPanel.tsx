import type { ReactNode } from 'react';

/**
 * A panel that is shut until opened, so a long page stays short: the title, an optional hint (a
 * count or the current value) and a chevron are all you see until you open it.
 */
export function FoldPanel({
    id,
    title,
    hint,
    children
}: {
    id: string;
    title: string;
    hint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <details className="panel fold" aria-labelledby={id}>
            <summary className="fold__summary">
                <h2 id={id}>{title}</h2>
                {hint ? <span className="fold__hint">{hint}</span> : null}
            </summary>
            <div className="fold__body">{children}</div>
        </details>
    );
}
