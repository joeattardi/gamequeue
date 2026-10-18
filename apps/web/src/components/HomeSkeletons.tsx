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

/** Placeholder tiles shaped like the `UpNext` items. */
export function UpNextSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ol className="upnext__list" role="status" aria-label="Loading your queue">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} aria-hidden="true">
                    <div className="upnext__item upnext__item--skeleton">
                        <span className="skeleton skeleton--upnext-cover" />
                        <span className="upnext__text">
                            <span className="skeleton skeleton--line skeleton--tiny" />
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: `${88 - (i % 3) * 16}%` }}
                            />
                            <span className="skeleton skeleton--line skeleton--sub skeleton--tiny" />
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    );
}
