import {
    RATING_MAX,
    type EntryStatus,
    type ProfileView,
    type ProfileDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import {
    Ban,
    CalendarDays,
    Gamepad2,
    Gift,
    Library,
    ListOrdered,
    ListTodo,
    Pause,
    Play,
    Trophy,
    WandSparkles
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfile } from '../api/profile';
import { Cover } from '../components/Cover';
import { ProfileSkeleton } from '../components/PageSkeletons';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

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

const STATS: { key: 'total' | EntryStatus; view: ProfileView; label: string; icon: ReactNode }[] = [
    {
        key: 'total',
        view: 'collection',
        label: 'Total games',
        icon: <Library aria-hidden="true" />
    },
    {
        key: 'unplayed',
        view: 'backlog',
        label: 'In backlog',
        icon: <ListTodo aria-hidden="true" />
    },
    { key: 'playing', view: 'playing', label: 'Playing', icon: <Play aria-hidden="true" /> },
    { key: 'paused', view: 'paused', label: 'Paused', icon: <Pause aria-hidden="true" /> },
    { key: 'finished', view: 'finished', label: 'Finished', icon: <Trophy aria-hidden="true" /> },
    { key: 'abandoned', view: 'abandoned', label: 'Abandoned', icon: <Ban aria-hidden="true" /> }
];

/** One stat tile; it links to the sub-page listing exactly those games. */
function Counter({
    className,
    to,
    icon,
    value,
    label
}: {
    className: string;
    to: string;
    icon: ReactNode;
    value: number;
    label: string;
}) {
    return (
        <li className={`counter ${className}`}>
            <Link to={to} className="counter__link">
                <span className="counter__icon">{icon}</span>
                <span className="counter__value">{value}</span>
                <span className="counter__label">{label}</span>
            </Link>
        </li>
    );
}

function Stats({ username, summary }: { username: string; summary: ProfileDto['summary'] }) {
    const count = (k: 'total' | EntryStatus) =>
        k === 'total' ? summary.total : summary.byStatus[k];
    const done = summary.byStatus.finished + summary.byStatus.abandoned;
    return (
        <>
            <ul className="counters">
                {STATS.map((st) => (
                    <Counter
                        key={st.key}
                        className={`counter--${st.key}`}
                        to={`/u/${username}/${st.view}`}
                        icon={st.icon}
                        value={count(st.key)}
                        label={st.label}
                    />
                ))}
                <Counter
                    className="counter--queued"
                    to={`/u/${username}/queue`}
                    icon={<ListOrdered aria-hidden="true" />}
                    value={summary.queued}
                    label="In queue"
                />
                <Counter
                    className="counter--wishlisted"
                    to={`/u/${username}/wishlist`}
                    icon={<Gift aria-hidden="true" />}
                    value={summary.wishlisted}
                    label="On wishlist"
                />
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

export function ProfilePage() {
    const { username = '' } = useParams();
    const profile = useProfile(username);
    usePageTitle(`${profile.data?.username ?? username}'s Profile`);
    const notFound =
        profile.error instanceof ApiRequestError ? profile.error.status === 404 : false;

    return (
        <>
            <PublicHeader />
            <main className="page">
                {profile.isPending && <ProfileSkeleton />}
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
                            <p>
                                <Link to={`/u/${profile.data.username}/stats`}>View stats</Link>
                                {' · '}
                                <Link to={`/u/${profile.data.username}/recap`}>Year in review</Link>
                            </p>
                            <Stats
                                username={profile.data.username}
                                summary={profile.data.summary}
                            />
                        </section>

                        <section aria-labelledby="p-playing">
                            <h2 id="p-playing">Currently playing</h2>
                            <Games
                                entries={profile.data.slots.flatMap((s) =>
                                    s.entry ? [s.entry] : []
                                )}
                            />
                        </section>

                        {profile.data.lists.map((l) => (
                            <section key={l.id} aria-label={l.name}>
                                <h2>{l.name}</h2>
                                <Games entries={l.entries} />
                            </section>
                        ))}

                        {profile.data.smartLists.map((l) => (
                            <section key={`smart-${l.id}`} aria-label={l.name}>
                                <h2>
                                    <WandSparkles aria-hidden="true" />
                                    {l.name}
                                </h2>
                                <ul className="rule-summary" aria-label="Rules">
                                    {l.description.map((d) => (
                                        <li key={d} className="badge">
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                                <Games entries={l.entries} />
                            </section>
                        ))}
                    </>
                )}
            </main>
        </>
    );
}
