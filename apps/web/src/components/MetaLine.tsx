import { Children, Fragment, type ReactNode } from 'react';

/** Joins the truthy parts with a middle dot, like `[a, b].filter(Boolean).join(' · ')` but for nodes. */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
    const shown = Children.toArray(parts.filter(Boolean));
    return (
        <>
            {shown.map((part, i) => (
                <Fragment key={i}>
                    {i > 0 && ' · '}
                    {part}
                </Fragment>
            ))}
        </>
    );
}
