/** Placeholder bays shaped like `SlotBay`, shown while the slots load. */
export function SlotSkeletons({ count = 2 }: { count?: number }) {
    return (
        <ul className="bays" role="status" aria-label="Loading slots">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="bay bay--skeleton" aria-hidden="true">
                    <span className="skeleton skeleton--line skeleton--bay-name" />
                    <div className="bay__game">
                        <span className="skeleton skeleton--bay-cover" />
                        <div className="stack">
                            <div>
                                <span
                                    className="skeleton skeleton--line skeleton--bay-title"
                                    style={{ width: `${82 - (i % 2) * 18}%` }}
                                />
                                <span className="skeleton skeleton--line skeleton--sub skeleton--bay-meta" />
                            </div>
                            <div className="row">
                                <span className="skeleton skeleton--btn" />
                                <span className="skeleton skeleton--btn skeleton--btn-wide" />
                            </div>
                        </div>
                    </div>
                    <div className="row bay__foot">
                        <span className="skeleton skeleton--btn skeleton--btn-ghost" />
                        <span className="skeleton skeleton--btn skeleton--btn-ghost" />
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
