import type { ReactNode } from 'react';
import { GridSkeletons, RowSkeletons } from './GridSkeletons';
import { useLayout } from './LayoutToggle';

/**
 * The page for a list, the queue or the wishlist while it loads: the heading (a skeleton when the
 * title isn't known yet), the layout toggle's space, and placeholders in the saved layout.
 */
export function ListLoading({
    icon,
    title,
    layoutKey,
    readOnly = false
}: {
    icon: ReactNode;
    /** Undefined when the title itself comes from the data (a user's list) */
    title?: string;
    layoutKey: string;
    /** For lists that can't be reordered (smart lists): the same rows as the collection */
    readOnly?: boolean;
}) {
    const [layout] = useLayout(layoutKey, 'list');
    return (
        <section aria-busy="true">
            <div className="page-head">
                <div>
                    <h1>
                        {icon}
                        {title ?? <span className="skeleton skeleton--title" />}
                    </h1>
                    <p className="muted">
                        <span className="skeleton skeleton--line skeleton--subtitle" />
                    </p>
                </div>
            </div>
            {layout === 'grid' || readOnly ? <GridSkeletons layout={layout} /> : <RowSkeletons />}
        </section>
    );
}
