import { RATING_MAX, type EntryStatus, type PublicEntryDto } from '@gamequeue/shared';
import {
    Ban,
    CalendarDays,
    Gamepad2,
    Library,
    ListOrdered,
    ListTodo,
    Pause,
    Play,
    Trophy
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfile } from '../api/profile';
import { Cover } from '../components/Cover';
import { Logo } from '../components/Logo';

function Games({ entries }: { entries: PublicEntryDto[] }) {
    if (entries.length === 0) return <p className="muted">Nothing here yet.</p>;
    return (
        <ul className="grid">
            {entries.map((e) => (
                <li key={e.id}>
                    <Cover imageId={e.game.coverImageId} name={e.game.name} />
                    <strong>{e.game.name}</strong>
                    <div>
                        <span className={`badge badge--${e.status}`}>{e.status}</span>
                        {e.rating !== null && (
                            <span className="muted">
                                {' '}
                                {e.rating}/{RATING_MAX}
                            </span>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
}

const STATS: { key: 'total' | EntryStatus; label: string; icon: ReactNode }[] = [
    { key: 'total', label: 'Total games', icon: <Library aria-hidden="true" /> },
    { key: 'unplayed', label: 'In backlog', icon: <ListTodo aria-hidden="true" /> },
    { key: 'playing', label: 'Playing', icon: <Play aria-hidden="true" /> },
    { key: 'paused', label: 'Paused', icon: <Pause aria-hidden="true" /> },
    { key: 'finished', label: 'Finished', icon: <Trophy aria-hidden="true" /> },
    { key: 'abandoned', label: 'Abandoned', icon: <Ban aria-hidden="true" /> }
];

function Stats({ summary }: { summary: { total: number; byStatus: Record<EntryStatus, number> } }) {
    const count = (k: 'total' | EntryStatus) =>
        k === 'total' ? summary.total : summary.byStatus[k];
    const done = summary.byStatus.finished + summary.byStatus.abandoned;
    return (
        <>
            <ul className="counters">
                {STATS.map((st) => (
                    <li key={st.key} className={`counter counter--${st.key}`}>
                        <span className="counter__icon">{st.icon}</span>
                        <span className="counter__value">{count(st.key)}</span>
                        <span className="counter__label">{st.label}</span>
                    </li>
                ))}
            </ul>
            {summary.total > 0 && (
                <div
                    className="statbar"
                    role="img"
                    aria-label={`${Math.round((summary.byStatus.finished / summary.total) * 100)}% finished, ${done} of ${summary.total} games played through`}
                >
                    {STATS.slice(1)
                        .filter((st) => count(st.key) > 0)
                        .map((st) => (
                            <span
                                key={st.key}
                                className={`statbar__seg counter--${st.key}`}
                                style={{ flexGrow: count(st.key) }}
                            />
                        ))}
                </div>
            )}
        </>
    );
}

/** Public pages are rendered for logged-out visitors too, so they bring their own header instead of the Shell. */
export function PublicHeader() {
    return (
        <header className="topbar">
            <Link to="/">
                <Logo />
            </Link>
        </header>
    );
}

export function ProfilePage() {
    const { username = '' } = useParams();
    const profile = useProfile(username);
    const notFound =
        profile.error instanceof ApiRequestError ? profile.error.status === 404 : false;

    return (
        <>
            <PublicHeader />
            <main className="page">
                {profile.isPending && <p role="status">Loading…</p>}
                {profile.isError && (
                    <p role="alert">
                        {notFound ? `There is no user called "${username}".` : "Couldn't load."}
                    </p>
                )}
                {profile.data && (
                    <>
                        <div className="profile-hero">
                            <div>
                                <h1>
                                    <Gamepad2 aria-hidden="true" />
                                    {profile.data.username}
                                </h1>
                                <p className="muted profile-hero__joined">
                                    <CalendarDays aria-hidden="true" />
                                    Joined{' '}
                                    {new Date(profile.data.joinedAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long'
                                    })}
                                </p>
                            </div>
                        </div>

                        <section aria-labelledby="p-collection">
                            <h2 id="p-collection">Collection</h2>
                            <Stats summary={profile.data.summary} />
                        </section>

                        <section aria-labelledby="p-playing">
                            <h2 id="p-playing">Currently playing</h2>
                            <Games
                                entries={profile.data.slots.flatMap((s) =>
                                    s.entry ? [s.entry] : []
                                )}
                            />
                        </section>

                        <section aria-labelledby="p-queue">
                            <h2 id="p-queue">Up next</h2>
                            <Link to={`/u/${profile.data.username}/queue`}>
                                <ListOrdered aria-hidden="true" /> See the full queue
                            </Link>
                        </section>

                        {profile.data.lists.map((l) => (
                            <section key={l.id} aria-label={l.name}>
                                <h2>{l.name}</h2>
                                <Games entries={l.entries} />
                            </section>
                        ))}
                    </>
                )}
            </main>
        </>
    );
}
