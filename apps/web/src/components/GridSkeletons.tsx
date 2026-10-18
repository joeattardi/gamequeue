import type { Layout } from './LayoutToggle';

/** Placeholders shaped like the collection's grid cards or list rows, shown while games load. */
export function GridSkeletons({ layout, count }: { layout: Layout; count?: number }) {
    if (layout === 'list')
        return (
            <ul className="game-rows" role="status" aria-label="Loading games">
                {Array.from({ length: count ?? 8 }, (_, i) => (
                    <li key={i} aria-hidden="true">
                        <div className="game-row game-row--skeleton">
                            <span className="skeleton skeleton--row-thumb" />
                            <span className="game-row__text">
                                <span
                                    className="skeleton skeleton--line"
                                    style={{ width: `${40 + ((i * 17) % 30)}%` }}
                                />
                                <span className="skeleton skeleton--line skeleton--sub" />
                            </span>
                            <span className="skeleton skeleton--badge" />
                        </div>
                    </li>
                ))}
            </ul>
        );
    return (
        <ul className="grid" role="status" aria-label="Loading games">
            {Array.from({ length: count ?? 12 }, (_, i) => (
                <li
                    key={i}
                    className="card card--skeleton"
                    aria-hidden="true"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                    <div className="card__link">
                        <span className="skeleton skeleton--card-cover" />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Placeholders shaped like the reorderable `.row-item` rows of the list, queue and wishlist. */
export function RowSkeletons({ count = 6 }: { count?: number }) {
    return (
        <ol className="rows" role="status" aria-label="Loading games">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="row-item row-item--skeleton" aria-hidden="true">
                    <span className="skeleton skeleton--handle" />
                    <span className="row-item__pos">
                        <span className="skeleton skeleton--pos" />
                    </span>
                    <span className="skeleton skeleton--row-cover" />
                    <div className="row-item__main">
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: `${180 + ((i * 53) % 120)}px` }}
                        />
                        <span className="skeleton skeleton--line skeleton--sub skeleton--row-sub" />
                    </div>
                    <div className="row-item__actions">
                        <span className="skeleton skeleton--action" />
                        <span className="skeleton skeleton--action" />
                        <span className="skeleton skeleton--action" />
                    </div>
                </li>
            ))}
        </ol>
    );
}
