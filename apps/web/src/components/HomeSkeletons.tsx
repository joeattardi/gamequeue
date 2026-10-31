/** Placeholder cards shaped like `PlayingCard`, shown while the playing games load. */
export function PlayingSkeletons({ count = 2 }: { count?: number }) {
    return (
        <ul className="play-grid" role="status" aria-label="Loading what you are playing">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="play-card play-card--skeleton" aria-hidden="true">
                    <div className="play-card__game">
                        <span className="skeleton skeleton--play-cover" />
                        <div className="stack">
                            <div>
                                <span
                                    className="skeleton skeleton--line skeleton--play-title"
                                    style={{ width: `${82 - (i % 2) * 18}%` }}
                                />
                                <span className="skeleton skeleton--line skeleton--sub skeleton--play-meta" />
                            </div>
                            <div className="row">
                                <span className="skeleton skeleton--btn" />
                                <span className="skeleton skeleton--btn skeleton--btn-wide" />
                            </div>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Placeholder tiles shaped like the `UpNext` cards. */
export function UpNextSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ol className="grid upnext__list" role="status" aria-label="Loading your queue">
            {Array.from({ length: count }, (_, i) => (
                <li
                    key={i}
                    className="card card--skeleton"
                    aria-hidden="true"
                    style={{ animationDelay: `${i * 60}ms` }}
                >
                    <div className="card__link">
                        <span className="skeleton skeleton--card-cover" />
                    </div>
                </li>
            ))}
        </ol>
    );
}

/** Placeholder tiles shaped like the `ReleasingSoon` cards. */
export function ReleasingSoonSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ol className="grid upnext__list" role="status" aria-label="Loading upcoming releases">
            {Array.from({ length: count }, (_, i) => (
                <li
                    key={i}
                    className="card card--skeleton"
                    aria-hidden="true"
                    style={{ animationDelay: `${i * 60}ms` }}
                >
                    <div className="card__link">
                        <span className="skeleton skeleton--card-cover" />
                    </div>
                </li>
            ))}
        </ol>
    );
}
