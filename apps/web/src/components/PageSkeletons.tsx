/** Skeletons for whole pages and for small pieces of UI (selects, checkboxes, list cards). */

/** The app boot screen, before we know whether anyone is signed in. */
export function BootSkeleton() {
    return (
        <main className="boot" role="status" aria-label="Loading">
            <span className="skeleton skeleton--title" />
            <span className="skeleton skeleton--line skeleton--subtitle skeleton--gap" />
            <div className="boot__blocks" aria-hidden="true">
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block" />
            </div>
        </main>
    );
}

/** The game page: cover on the left, header, summary and a few panels on the right. */
export function EntrySkeleton() {
    return (
        <article className="entry" role="status" aria-label="Loading game">
            <span className="skeleton skeleton--line skeleton--back" aria-hidden="true" />
            <div className="entry__layout" aria-hidden="true">
                <div className="entry__cover">
                    <span className="skeleton skeleton--card-cover" />
                </div>
                <div className="stack">
                    <header className="entry__head">
                        <div>
                            <span className="skeleton skeleton--title skeleton--entry-title" />
                            <span className="skeleton skeleton--line skeleton--subtitle skeleton--gap" />
                        </div>
                        <span className="skeleton skeleton--gauge-lg" />
                    </header>
                    <div className="stack">
                        <span className="skeleton skeleton--line" style={{ width: '96%' }} />
                        <span className="skeleton skeleton--line" style={{ width: '90%' }} />
                        <span className="skeleton skeleton--line" style={{ width: '62%' }} />
                    </div>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="panel">
                            <span className="skeleton skeleton--line skeleton--panel-title" />
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: `${70 - i * 12}%` }}
                            />
                            <span className="skeleton skeleton--line skeleton--sub" />
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
}

/** The public profile: hero, the stat tiles and their bar, then a games section. */
export function ProfileSkeleton() {
    return (
        <div role="status" aria-label="Loading profile">
            <div className="profile-hero" aria-hidden="true">
                <div>
                    <span className="skeleton skeleton--title" />
                    <span className="skeleton skeleton--line skeleton--subtitle skeleton--gap" />
                </div>
            </div>
            <div aria-hidden="true">
                <h2>
                    <span className="skeleton skeleton--line skeleton--section" />
                </h2>
                <ul className="counters">
                    {Array.from({ length: 8 }, (_, i) => (
                        <li key={i} className="counter">
                            <div className="counter__link">
                                <span className="counter__icon">
                                    <span className="skeleton skeleton--counter-icon" />
                                </span>
                                <span className="counter__value">
                                    <span className="skeleton skeleton--counter-value" />
                                </span>
                                <span className="counter__label">
                                    <span className="skeleton skeleton--line skeleton--counter-label" />
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="statbar">
                    <span className="skeleton skeleton--statbar" />
                </div>
                <h2>
                    <span className="skeleton skeleton--line skeleton--section" />
                </h2>
                <ul className="public-grid">
                    {Array.from({ length: 6 }, (_, i) => (
                        <li key={i}>
                            <div className="public-skeleton public-skeleton--cover" />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/** Placeholder `.list-card` tiles for the lists page. */
export function ListCardSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ul className="list-cards" role="status" aria-label="Loading lists">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} aria-hidden="true">
                    <div className="list-card">
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: `${70 - (i % 3) * 14}%` }}
                        />
                        <span className="skeleton skeleton--line skeleton--sub skeleton--row-sub" />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Stands in for a `<select>` whose options are still loading. */
export function SelectSkeleton({ label }: { label: string }) {
    return <span className="skeleton skeleton--select" role="status" aria-label={label} />;
}

/** Placeholder `.check` boxes (a list of lists, say) while their options load. */
export function CheckSkeletons({ count = 3, label }: { count?: number; label: string }) {
    return (
        <div className="checks" role="status" aria-label={label}>
            {Array.from({ length: count }, (_, i) => (
                <span key={i} className="check check--skeleton" aria-hidden="true">
                    <span className="skeleton skeleton--check" />
                    <span
                        className="skeleton skeleton--line skeleton--check-label"
                        style={{ width: `${56 + ((i * 23) % 40)}px` }}
                    />
                </span>
            ))}
        </div>
    );
}

/** Placeholder rows for the slot editor dialog. */
export function SlotEditSkeletons({ count = 2 }: { count?: number }) {
    return (
        <ul className="slot-edit" role="status" aria-label="Loading slots">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="slot-edit__row" aria-hidden="true">
                    <span className="skeleton skeleton--select skeleton--slot-name" />
                    <span className="skeleton skeleton--action" />
                    <span className="skeleton skeleton--action" />
                    <span className="skeleton skeleton--action" />
                </li>
            ))}
        </ul>
    );
}

/** Placeholder playthrough rows on the game page. */
export function HistorySkeletons({ count = 2 }: { count?: number }) {
    return (
        <ul className="history" role="status" aria-label="Loading playthroughs">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="history__row" aria-hidden="true">
                    <span className="history__main">
                        <span className="skeleton skeleton--badge" />
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: `${130 - i * 20}px` }}
                        />
                    </span>
                    <span className="skeleton skeleton--action" />
                </li>
            ))}
        </ul>
    );
}
