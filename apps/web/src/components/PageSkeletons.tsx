/** Skeletons for whole pages and for small pieces of UI (selects, checkboxes, list cards). */
import { GridSkeletons } from './GridSkeletons';

/** The series page: heading, summary line and the list rows of the games. */
export function SeriesSkeleton() {
    return (
        <section aria-busy="true">
            <div className="page-head">
                <div>
                    <h1>
                        <span className="skeleton skeleton--title" />
                    </h1>
                    <p className="muted">
                        <span className="skeleton skeleton--line skeleton--subtitle" />
                    </p>
                </div>
            </div>
            <GridSkeletons layout="list" count={8} />
        </section>
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
                <span className="skeleton skeleton--avatar" />
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
                        <span className="list-card__covers skeleton" />
                        <span className="list-card__text">
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: `${70 - (i % 3) * 14}%` }}
                            />
                            <span className="skeleton skeleton--line skeleton--sub skeleton--row-sub" />
                        </span>
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

/** The smart list editor while an existing list loads: name, a couple of rules and the preview. */
export function EditorSkeleton() {
    return (
        <section aria-busy="true" role="status" aria-label="Loading smart list">
            <div className="page-head">
                <div>
                    <h1>
                        <span className="skeleton skeleton--title" />
                    </h1>
                    <p className="muted">
                        <span className="skeleton skeleton--line skeleton--subtitle" />
                    </p>
                </div>
            </div>
            <div className="stack" aria-hidden="true">
                <span className="skeleton skeleton--select" />
                {[0, 1].map((i) => (
                    <div key={i} className="rule">
                        <div className="rule__head">
                            <span className="skeleton skeleton--select" />
                        </div>
                        <div className="checks">
                            {[0, 1, 2].map((j) => (
                                <span key={j} className="check check--skeleton">
                                    <span className="skeleton skeleton--check" />
                                    <span
                                        className="skeleton skeleton--line skeleton--check-label"
                                        style={{ width: `${56 + (((i + j) * 23) % 40)}px` }}
                                    />
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** The admin page's backup panel: status line and three detail rows. */
export function BackupSkeleton() {
    return (
        <div className="backup" role="status" aria-label="Loading backup status">
            <span className="skeleton skeleton--block" style={{ height: 52 }} aria-hidden="true" />
            <div className="backup__facts" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <div key={i}>
                        <span className="skeleton skeleton--line skeleton--sub" />
                        <span className="skeleton skeleton--line" style={{ width: '70%' }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** The admin users list: avatar, name and email lines per row. */
export function UserRowSkeletons({ count = 4 }: { count?: number }) {
    return (
        <ul className="admin-users" role="status" aria-label="Loading users">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="admin-user" aria-hidden="true">
                    <span className="skeleton skeleton--user-avatar" />
                    <div className="admin-user__main">
                        <span className="skeleton skeleton--line" style={{ width: '30%' }} />
                        <span
                            className="skeleton skeleton--line skeleton--sub"
                            style={{ width: '45%' }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** The admin dashboard's users tile: four number/label pairs. */
export function UserStatsSkeleton() {
    return (
        <dl className="admin-stats" role="status" aria-label="Loading user stats">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} aria-hidden="true">
                    <span
                        className="skeleton skeleton--line"
                        style={{ width: 40, height: '1.8rem' }}
                    />
                    <span className="skeleton skeleton--line skeleton--sub" style={{ width: 80 }} />
                </div>
            ))}
        </dl>
    );
}

/** The admin database page: stat groups and the table list. */
export function DatabaseSkeleton({ label = 'Loading database stats' }: { label?: string }) {
    return (
        <div className="stack" role="status" aria-label={label}>
            {[0, 1, 2].map((i) => (
                <div key={i} className="panel" aria-hidden="true">
                    <span className="skeleton skeleton--line" style={{ width: '25%' }} />
                    <div className="admin-stats">
                        {[0, 1, 2, 3].map((j) => (
                            <div key={j}>
                                <span
                                    className="skeleton skeleton--line"
                                    style={{ width: 60, height: '1.8rem' }}
                                />
                                <span
                                    className="skeleton skeleton--line skeleton--sub"
                                    style={{ width: 90 }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** The admin user edit page: a panel of form fields. */
export function UserFormSkeleton() {
    return (
        <div className="stack" role="status" aria-label="Loading user">
            <div className="panel" aria-hidden="true">
                <span className="skeleton skeleton--line" style={{ width: '25%' }} />
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="skeleton skeleton--block" style={{ height: 40 }} />
                ))}
            </div>
        </div>
    );
}

/** The stats page: a row of number tiles and three chart panels. */
export function StatsSkeleton() {
    return (
        <div className="stack sv" role="status" aria-label="Loading stats">
            <ul className="sv-tiles" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="sv-tile">
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: '40%', height: '1.8rem' }}
                        />
                        <span className="skeleton skeleton--line skeleton--sub" />
                    </li>
                ))}
            </ul>
            {[0, 1, 2].map((i) => (
                <section key={i} className="panel" aria-hidden="true">
                    <span className="skeleton skeleton--panel-title" />
                    <span className="skeleton skeleton--block" style={{ height: 150 }} />
                </section>
            ))}
        </div>
    );
}

/** The year-in-review page: a year picker and three coloured cards. */
export function RecapSkeleton() {
    return (
        <div className="stack rc" role="status" aria-label="Loading recap">
            <span className="skeleton skeleton--line" style={{ width: 220 }} aria-hidden="true" />
            {[0, 1, 2].map((i) => (
                <section key={i} className={`rc-card rc-card--${i + 1}`} aria-hidden="true">
                    <span className="skeleton skeleton--line" style={{ width: '30%' }} />
                    <span
                        className="skeleton skeleton--line"
                        style={{ width: '25%', height: '3rem' }}
                    />
                    <span className="skeleton skeleton--line skeleton--sub" />
                </section>
            ))}
        </div>
    );
}
