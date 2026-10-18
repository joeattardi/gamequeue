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
                    </div>
                </li>
            ))}
        </ul>
    );
}
