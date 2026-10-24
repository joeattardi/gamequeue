import {
    RATING_MAX,
    type EntryStatus,
    type ProfileView,
    type ProfileDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import {
    Ban,
    BarChart3,
    CalendarDays,
    Gift,
    Heart,
    Library,
    ListOrdered,
    ListTodo,
    Pause,
    Play,
    Trophy
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfile } from '../api/profile';
import { ActivityList } from '../components/ActivityFeed';
import { Avatar } from '../components/Avatar';
import { Cover } from '../components/Cover';
import { ListCard } from '../components/ListCard';
import { SocialLinksList } from '../components/SocialLinks';
import { ProfileSkeleton } from '../components/PageSkeletons';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

function Games({ username, entries }: { username: string; entries: PublicEntryDto[] }) {
    if (entries.length === 0) return <p className="muted">Nothing here yet.</p>;
    return <GameGrid username={username} entries={entries} />;
}

function GameGrid({ username, entries }: { username: string; entries: PublicEntryDto[] }) {
    return (
        <ul className="grid">
            {entries.map((e) => (
                <li key={e.id}>
                    <Link to={`/u/${username}/games/${e.game.id}`} className="game-link">
                        <Cover imageId={e.game.coverImageId} name={e.game.name} />
                        <strong>{e.game.name}</strong>
                    </Link>
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
    value?: number;
    label: string;
}) {
    return (
        <li className={`counter ${value === undefined ? 'counter--nav ' : ''}${className}`}>
            <Link to={to} className="counter__link">
                <span className="counter__icon">{icon}</span>
                {value !== undefined && <span className="counter__value">{value}</span>}
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
                    className="counter--favorites"
                    to={`/u/${username}/favorites`}
                    icon={<Heart aria-hidden="true" />}
                    value={summary.favorites}
                    label="Favorites"
                />
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
                <Counter
                    className="counter--stats"
                    to={`/u/${username}/stats`}
                    icon={<BarChart3 aria-hidden="true" />}
                    label="View stats"
                />
                <Counter
                    className="counter--recap"
                    to={`/u/${username}/recap`}
                    icon={<CalendarDays aria-hidden="true" />}
                    label="Year in review"
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

/** Lists and smart lists together as tiles, by name; smart ones carry a wand. */
function ProfileLists({ profile }: { profile: ProfileDto }) {
    const tiles = [
        ...profile.lists.map((l) => ({ ...l, smart: false })),
        ...profile.smartLists.map((l) => ({ ...l, smart: true }))
    ].sort(
        (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id
    );
    if (tiles.length === 0) return null;
    return (
        <section aria-labelledby="p-lists">
            <h2 id="p-lists">Lists</h2>
            <ul className="list-cards">
                {tiles.map((l) => (
                    <ListCard
                        key={`${l.smart ? 'smart' : 'list'}-${l.id}`}
                        to={`/u/${profile.username}/${l.smart ? 'smart-lists' : 'lists'}/${l.id}`}
                        name={l.name}
                        count={l.total}
                        covers={l.covers}
                        smart={l.smart}
                    />
                ))}
            </ul>
        </section>
    );
}

/** Grids as tiles; each links to its public page. */
function ProfileGrids({ profile }: { profile: ProfileDto }) {
    if (profile.grids.length === 0) return null;
    return (
        <section aria-labelledby="p-grids">
            <h2 id="p-grids">Grids</h2>
            <ul className="list-cards">
                {profile.grids.map((g) => (
                    <ListCard
                        key={g.id}
                        to={`/u/${profile.username}/grids/${g.id}`}
                        name={g.title}
                        count={g.filled}
                        covers={g.covers}
                        detail={`${g.cols}×${g.rows} · ${g.filled} of ${g.cols * g.rows} filled`}
                    />
                ))}
            </ul>
        </section>
    );
}

/** Tier lists as tiles; each links to its public page. */
function ProfileTierLists({ profile }: { profile: ProfileDto }) {
    if (profile.tierLists.length === 0) return null;
    return (
        <section aria-labelledby="p-tiers">
            <h2 id="p-tiers">Tier lists</h2>
            <ul className="list-cards">
                {profile.tierLists.map((l) => (
                    <ListCard
                        key={l.id}
                        to={`/u/${profile.username}/tiers/${l.id}`}
                        name={l.title}
                        count={l.ranked}
                        covers={l.covers}
                        detail={`${l.ranked} ranked`}
                    />
                ))}
            </ul>
        </section>
    );
}

/** The latest few events; the rest is on the activity page. Absent when the owner hides it. */
function ProfileActivity({ profile }: { profile: ProfileDto }) {
    const { activity } = profile;
    if (!activity || activity.total === 0) return null;
    return (
        <section aria-labelledby="p-activity">
            <h2 id="p-activity">Recent activity</h2>
            <ActivityList username={profile.username} events={activity.events} />
            {activity.total > activity.events.length && (
                <p className="activity-more">
                    <Link to={`/u/${profile.username}/activity`}>
                        See all {activity.total} events
                    </Link>
                </p>
            )}
        </section>
    );
}

export function ProfilePage() {
    const { username = '' } = useParams();
    const profile = useProfile(username);
    usePageTitle(`${profile.data?.username ?? username}'s Profile`);
    const notFound =
        profile.error instanceof ApiRequestError ? profile.error.status === 404 : false;

    // Once the hero has scrolled under the sticky header, the header shows who this is
    const [hero, setHero] = useState<HTMLDivElement | null>(null);
    const [heroGone, setHeroGone] = useState(false);
    useEffect(() => {
        if (!hero) return;
        const observer = new IntersectionObserver(([e]) => setHeroGone(!e!.isIntersecting), {
            rootMargin: '-60px 0px 0px 0px'
        });
        observer.observe(hero);
        return () => observer.disconnect();
    }, [hero]);

    return (
        <>
            <PublicHeader
                identity={
                    profile.data && {
                        username: profile.data.username,
                        realName: profile.data.realName,
                        avatarUpdatedAt: profile.data.avatarUpdatedAt,
                        shown: heroGone
                    }
                }
            />
            <main className="page">
                {profile.isPending && <ProfileSkeleton />}
                {profile.isError && (
                    <p role="alert">
                        {notFound ? `There is no user called "${username}".` : "Couldn't load."}
                    </p>
                )}
                {profile.data && (
                    <>
                        <div className="profile-hero" ref={setHero}>
                            <Avatar
                                username={profile.data.username}
                                size={72}
                                avatarUpdatedAt={profile.data.avatarUpdatedAt}
                            />
                            <div>
                                <h1>{profile.data.realName ?? profile.data.username}</h1>
                                {profile.data.realName && (
                                    <p className="muted profile-hero__username">
                                        {profile.data.username}
                                    </p>
                                )}
                                <p className="muted profile-hero__joined">
                                    <CalendarDays aria-hidden="true" />
                                    Joined{' '}
                                    {new Date(profile.data.joinedAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long'
                                    })}
                                </p>
                                <SocialLinksList links={profile.data.socialLinks} />
                            </div>
                        </div>

                        <div className="profile-layout">
                            <section aria-labelledby="p-collection" className="profile-side">
                                <h2 id="p-collection">Collection</h2>
                                <Stats
                                    username={profile.data.username}
                                    summary={profile.data.summary}
                                />
                            </section>

                            <div className="profile-main">
                                <section aria-labelledby="p-playing">
                                    <h2 id="p-playing">Currently playing</h2>
                                    <Games
                                        username={profile.data.username}
                                        entries={profile.data.slots.flatMap((s) =>
                                            s.entry ? [s.entry] : []
                                        )}
                                    />
                                </section>

                                <ProfileActivity profile={profile.data} />

                                <ProfileLists profile={profile.data} />
                                <ProfileGrids profile={profile.data} />
                                <ProfileTierLists profile={profile.data} />
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
