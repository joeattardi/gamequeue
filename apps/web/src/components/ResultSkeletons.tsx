/** Placeholder rows shaped like `.result` buttons, shown while search results load. */
export function ResultSkeletons({ trailing = 'gauge' }: { trailing?: 'gauge' | 'badge' }) {
    return (
        <>
            {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} aria-hidden="true">
                    <div className="result result--skeleton">
                        <span className="skeleton skeleton--cover" />
                        <span className="result__text">
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: `${70 - (i % 3) * 14}%` }}
                            />
                            <span
                                className="skeleton skeleton--line skeleton--sub"
                                style={{ width: `${48 - (i % 2) * 12}%` }}
                            />
                        </span>
                        {trailing === 'gauge' ? (
                            <span className="result__score">
                                <span className="skeleton skeleton--gauge" />
                            </span>
                        ) : (
                            <span className="skeleton skeleton--badge" />
                        )}
                    </div>
                </li>
            ))}
        </>
    );
}

/** A whole `.results` list of placeholders, announced as loading. */
export function ResultListSkeleton({
    trailing = 'badge',
    label = 'Loading games'
}: {
    trailing?: 'gauge' | 'badge';
    label?: string;
}) {
    return (
        <ul className="results" role="status" aria-label={label}>
            <ResultSkeletons trailing={trailing} />
        </ul>
    );
}
