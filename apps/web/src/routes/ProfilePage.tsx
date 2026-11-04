import {
    statusLabel,
    RATING_MAX,
    type EntryStatus,
    type ProfileView,
    type ProfileDto,
    type PublicEntryDto
} from '@gamequeue/shared';
import {
    ArrowRight,
    BarChart3,
    CalendarDays,
    Check,
    Copy,
    Gift,
    ListOrdered,
    Pencil
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAuthConfig, useMe } from '../api/auth';
import { useProfile } from '../api/profile';
import { groupActivity, limitDays } from '../activityGroups';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { ActivityDays } from '../components/ActivityFeed';
import { HighlightRow } from '../components/HighlightRow';
import { useProfileJournals } from '../api/journal';
import { ProfileBadge } from '../components/ProfileBadge';
import { Avatar } from '../components/Avatar';
import { CountUp } from '../components/CountUp';
import { Cover } from '../components/Cover';
import { ListCard } from '../components/ListCard';
import { SocialLinksList } from '../components/SocialLinks';
import { ProfileSkeleton } from '../components/PageSkeletons';
import { PublicHeader } from '../components/PublicHeader';
import { PublicMain } from '../components/ShellContext';
import { statusColor, statusText } from '../statusColor';
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
                        <span className={`badge badge--${e.status}`}>{statusLabel(e.status)}</span>
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

/** The five states in the order they sit in the status bar, each linking to its public page. */
const STATUS_SEGMENTS: { status: EntryStatus; view: ProfileView }[] = [
    { status: 'playing', view: 'playing' },
    { status: 'paused', view: 'paused' },
    { status: 'finished', view: 'finished' },
    { status: 'abandoned', view: 'abandoned' },
    { status: 'unplayed', view: 'backlog' }
];

function Stat({ to, value, label }: { to: string; value: number | string; label: string }) {
    return (
        <li className="pstat">
            <Link to={to} className="pstat__link">
                <span className="pstat__value">
                    {typeof value === 'number' ? <CountUp value={value} /> : value}
                </span>
                <span className="pstat__label">{label}</span>
            </Link>
        </li>
    );
}

/**
 * The collection at a glance: three real numbers, one stacked bar split by status (its legend is
 * the links to each status page, with the word and count, so colour is never the only cue) and
 * quiet links to the queue, wishlist, stats and Save File.
 */
function Stats({ username, summary }: { username: string; summary: ProfileDto['summary'] }) {
    const { total, byStatus } = summary;
    const base = `/u/${username}`;
    const finishedPct = total > 0 ? Math.round((byStatus.finished / total) * 100) : 0;
    const shown = STATUS_SEGMENTS.filter((s) => byStatus[s.status] > 0);
    return (
        <div className="pstats">
            <ul className="pstats__numbers">
                <Stat to={`${base}/collection`} value={total} label="Games" />
                <Stat to={`${base}/finished`} value={byStatus.finished} label="Finished" />
                <Stat to={`${base}/favorites`} value={summary.favorites} label="Favorites" />
            </ul>
            {total > 0 && (
                <>
                    <div
                        className="statbar"
                        role="img"
                        aria-label={`${finishedPct}% finished: ${shown
                            .map((s) => `${byStatus[s.status]} ${statusLabel(s.status)}`)
                            .join(', ')}`}
                    >
                        {shown.map((s) => (
                            <span
                                key={s.status}
                                className="statbar__seg"
                                style={{
                                    flexGrow: byStatus[s.status],
                                    background: statusColor(s.status)
                                }}
                            />
                        ))}
                    </div>
                    <ul className="statlegend">
                        {shown.map((s) => (
                            <li key={s.status}>
                                <Link to={`${base}/${s.view}`}>
                                    <span
                                        className="statlegend__dot"
                                        style={{ background: statusColor(s.status) }}
                                        aria-hidden="true"
                                    />
                                    {statusText(s.status)}
                                    <span className="statlegend__n">{byStatus[s.status]}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <ul className="pstats__links">
                <li>
                    <Link to={`${base}/queue`}>
                        <ListOrdered aria-hidden="true" /> In queue
                        <span className="statlegend__n">{summary.queued}</span>
                    </Link>
                </li>
                <li>
                    <Link to={`${base}/wishlist`}>
                        <Gift aria-hidden="true" /> On wishlist
                        <span className="statlegend__n">{summary.wishlisted}</span>
                    </Link>
                </li>
                <li>
                    <Link to={`${base}/stats`}>
                        <BarChart3 aria-hidden="true" /> Stats
                    </Link>
                </li>
                <li>
                    <Link to={`${base}/recap`}>
                        <CalendarDays aria-hidden="true" /> Save File
                    </Link>
                </li>
            </ul>
        </div>
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

/** The playthrough journals this person made public; absent when there are none. */
function ProfileJournals({ username }: { username: string }) {
    const q = useProfileJournals(username);
    if (!q.data || q.data.length === 0) return null;
    return (
        <section aria-labelledby="p-journals">
            <h2 id="p-journals">Journals</h2>
            <ul className="journal-cards">
                {q.data.map((j) => (
                    <li key={j.slug}>
                        <Link className="journal-card" to={`/p/${j.slug}`}>
                            <Cover imageId={j.game.coverImageId} name={j.game.name} size="720p" />
                            <span className="journal-card__text">
                                <strong>{j.game.name}</strong>
                                <span className="muted">
                                    {j.outcome ?? 'in progress'}
                                    {j.posts > 0 &&
                                        ` · ${j.posts} ${j.posts === 1 ? 'post' : 'posts'}`}
                                </span>
                            </span>
                        </Link>
                    </li>
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
            <PublicMain>
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
                                        entries={profile.data.playing}
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
                                <ProfileJournals username={profile.data.username} />
                            </div>
                        </div>
                    </>
                )}
            </PublicMain>
        </>
    );
}
