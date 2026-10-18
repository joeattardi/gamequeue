/** Placeholder cards shaped like the collection's `.card`, shown while games load. */
export function GridSkeletons({ count = 12 }: { count?: number }) {
    return (
        <ul className="grid" role="status" aria-label="Loading games">
            {Array.from({ length: count }, (_, i) => (
                <li
                    key={i}
                    className="card card--skeleton"
                    aria-hidden="true"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                    <div className="card__link">
                        <span className="skeleton skeleton--card-cover" />
                        <div className="card__meta">
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: `${86 - (i % 3) * 14}%` }}
                            />
                            <span
                                className="skeleton skeleton--line skeleton--sub"
                                style={{ width: `${52 - (i % 2) * 12}%` }}
                            />
                            <span className="card__chips">
                                <span className="skeleton skeleton--badge" />
                                {i % 2 === 0 && <span className="skeleton skeleton--badge" />}
                            </span>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}
