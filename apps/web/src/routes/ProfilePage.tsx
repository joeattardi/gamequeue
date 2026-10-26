import {
    RATING_MAX,
    type EntryStatus,
    type ProfileView,
    type ProfileDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import {
    ArrowRight,
    Ban,
    BarChart3,
    CalendarDays,
    Check,
    Copy,
    Gift,
    Heart,
    Library,
    ListOrdered,
    ListTodo,
    Pause,
    Pencil,
    Play,
    Trophy
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAuthConfig, useMe } from '../api/auth';
import { useProfile } from '../api/profile';
import { groupActivity, limitDays } from '../activityGroups';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { ActivityDays } from '../components/ActivityFeed';
import { HighlightRow } from '../components/HighlightRow';
import { ProfileBadge } from '../components/ProfileBadge';
import { Avatar } from '../components/Avatar';
import { CountUp } from '../components/CountUp';
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
    label,
    blurb
}: {
    className: string;
    to: string;
    icon: ReactNode;
    value?: number;
    label: string;
    /** Only for the link tiles (no `value`): a line saying what is behind the link */
    blurb?: string;
}) {
    if (value === undefined)
        return (
            <li className={`counter counter--nav ${className}`}>
                <Link to={to} className="counter__link">
                    <span className="counter__icon">{icon}</span>
                    <span className="counter__title">{label}</span>
                    {blurb && <span className="counter__blurb">{blurb}</span>}
                    <ArrowRight className="counter__go" aria-hidden="true" />
                </Link>
            </li>
        );
    return (
        <li className={`counter ${className}`}>
            <Link to={to} className="counter__link">
                <span className="counter__icon">{icon}</span>
                <span className="counter__value">
                    <CountUp value={value} />
                </span>
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
                    blurb="Finishes per year, top genres, play time"
                />
                <Counter
                    className="counter--recap"
                    to={`/u/${username}/recap`}
                    icon={<CalendarDays aria-hidden="true" />}
                    label="Save File"
                    blurb="Your year in games, ready to share"
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

/** Rows (single events or folded runs) shown on the profile. */
const ACTIVITY_ROWS = 6;

/** The latest few events; the rest is on the activity page. Absent when the owner hides it. */
function ProfileActivity({ profile }: { profile: ProfileDto }) {
    const { activity } = profile;
    const grouped = useMemo(
        () => (activity ? limitDays(groupActivity(activity.events), ACTIVITY_ROWS) : undefined),
        [activity]
    );
    if (!activity || !grouped || activity.total === 0) return null;
    return (
        <section aria-labelledby="p-activity">
            <h2 id="p-activity">Recent activity</h2>
            <ActivityDays username={profile.username} days={grouped.days} />
            {activity.total > grouped.events && (
                <p className="activity-more">
                    <Link to={`/u/${profile.username}/activity`}>
                        See all {activity.total} events
                    </Link>
                </p>
            )}
        </section>
    );
}

/** For the owner looking at their own public page: the two things they usually came here to do. */
function OwnerActions({ username }: { username: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/u/${username}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked (e.g. an insecure origin): the address bar has the same link
        }
    }
    return (
        <div className="profile-hero__owner">
            <button type="button" className="btn" onClick={copy}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
            </button>
            <Link className="btn" to="/account">
                <Pencil aria-hidden="true" />
                Edit profile
            </Link>
            <span className="sr-only" role="status">
                {copied ? 'Link copied' : ''}
            </span>
        </div>
    );
}

/** For visitors who aren't signed in: invites them to make their own profile, if signups are open. */
function SignupCta() {
    const me = useMe();
    const config = useAuthConfig();
    if (me.data !== null || config.data?.signupsEnabled !== true) return null;
    return (
        <aside className="profile-hero__cta" aria-label="Create your own GameQueue">
            <p>Track your own games.</p>
            <Link className="btn btn--primary" to="/register">
                Create your GameQueue
                <ArrowRight aria-hidden="true" />
            </Link>
        </aside>
    );
}

export function ProfilePage() {
    const { username = '' } = useParams();
    const profile = useProfile(username);
    const me = useMe();
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
                        avatarIcon: profile.data.avatarIcon,
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
                                avatarIcon={profile.data.avatarIcon}
                            />
                            <div>
                                <div className="profile-hero__title">
                                    <h1>{profile.data.realName ?? profile.data.username}</h1>
                                    {profile.data.badge && (
                                        <ProfileBadge badge={profile.data.badge} />
                                    )}
                                </div>
                                {profile.data.realName && (
                                    <p className="muted profile-hero__username">
                                        {profile.data.username}
                                    </p>
                                )}
                                {profile.data.bio && (
                                    <p className="profile-hero__bio">{profile.data.bio}</p>
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
                            {me.data?.username === profile.data.username ? (
                                <OwnerActions username={profile.data.username} />
                            ) : (
                                <SignupCta />
                            )}
                        </div>

                        <div className="profile-layout">
                            <section aria-label="Collection" className="profile-side">
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

                                <HighlightRow
                                    id="p-finished"
                                    title="Recently finished"
                                    username={profile.data.username}
                                    entries={profile.data.recentlyFinished}
                                    seeAll={{
                                        to: `/u/${profile.data.username}/finished`,
                                        count: profile.data.summary.byStatus.finished,
                                        noun: 'finished games'
                                    }}
                                />
                                <HighlightRow
                                    id="p-favorites"
                                    title="Favorites"
                                    username={profile.data.username}
                                    entries={profile.data.favoriteGames}
                                    seeAll={{
                                        to: `/u/${profile.data.username}/favorites`,
                                        count: profile.data.summary.favorites,
                                        noun: 'favorites'
                                    }}
                                />
                                {profile.data.activity && (
                                    <ActivityCalendar
                                        username={profile.data.username}
                                        scope={{ username: profile.data.username }}
                                    />
                                )}
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
