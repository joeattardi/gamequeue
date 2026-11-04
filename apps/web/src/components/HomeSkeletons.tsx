/** Placeholder cards shaped like `PlayingCard`, shown while the playing games load. */
export function PlayingSkeletons({ count = 2 }: { count?: number }) {
    return (
        <ul className="play-list" role="status" aria-label="Loading what you are playing">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="play-hero play-hero--skeleton" aria-hidden="true">
                    <div className="play-hero__game">
                        <span className="skeleton skeleton--play-cover" />
                        <div className="play-hero__body">
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

/** Placeholder rows shaped like the `UpNext` rows. */
export function UpNextSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ol className="upnext-rows" role="status" aria-label="Loading your queue">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="upnext-row upnext-row--skeleton" aria-hidden="true">
                    <span className="skeleton skeleton--upnext-cover" />
                    <div className="upnext-row__main">
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: `${70 - (i % 3) * 14}%` }}
                        />
                        <span className="skeleton skeleton--line skeleton--sub" />
                    </div>
                    <span className="skeleton skeleton--btn skeleton--btn-wide" />
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
