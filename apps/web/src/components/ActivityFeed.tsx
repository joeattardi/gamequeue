import {
    ACTIVITY_VERBS,
    RATING_MAX,
    type ActivityEventDto,
    type ActivityType
} from '@gamequeue/shared';
import {
    Ban,
    ChevronDown,
    CircleCheck,
    Gift,
    Grid3x3,
    Heart,
    ListChecks,
    ListOrdered,
    ListPlus,
    Pause,
    Play,
    Plus,
    Rows3,
    SlidersHorizontal,
    Star
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { timeAgo } from '../lib';
import { groupActivity, type ActivityDay, type ActivityItem } from '../activityGroups';
import { Cover } from './Cover';

const ICONS: Record<ActivityType, ReactNode> = {
    added: <Plus />,
    started: <Play />,
    paused: <Pause />,
    resumed: <Play />,
    finished: <CircleCheck />,
    abandoned: <Ban />,
    rated: <Star />,
    favorited: <Heart />,
    queued: <ListOrdered />,
    slotted: <ListChecks />,
    wishlisted: <Gift />,
    grid: <Grid3x3 />,
    tier: <Rows3 />,
    list: <ListPlus />,
    smartlist: <SlidersHorizontal />
};

/** Where an event's subject lives on the public profile; none for the ones without a page of their own. */
const SUBJECT_PATH: Partial<Record<ActivityType, string>> = {
    grid: 'grids',
    tier: 'tiers',
    list: 'lists',
    smartlist: 'smart-lists'
};

function sentence(e: ActivityEventDto, name: ReactNode): ReactNode {
    switch (e.type) {
        case 'added':
            return <>Added {name} to the collection</>;
        case 'started':
            return <>Started {name}</>;
        case 'paused':
            return <>Paused {name}</>;
        case 'resumed':
            return <>Resumed {name}</>;
        case 'finished':
            return <>Finished {name}</>;
        case 'abandoned':
            return <>Abandoned {name}</>;
        case 'rated':
            return (
                <>
                    Rated {name} {e.detail}/{RATING_MAX}
                </>
            );
        case 'favorited':
            return <>Made {name} a favorite</>;
        case 'queued':
            return <>Queued {name}</>;
        case 'slotted':
            return (
                <>
                    Moved {name} to the {e.subject?.name} slot
                </>
            );
        case 'wishlisted':
            return <>Wishlisted {name}</>;
        case 'grid':
            return <>Created the grid {name}</>;
        case 'tier':
            return <>Created the tier list {name}</>;
        case 'list':
            return <>Created the list {name}</>;
        case 'smartlist':
            return <>Created the smart list {name}</>;
    }
}

function ActivityRow({
    username,
    event,
    showAgo
}: {
    username: string;
    event: ActivityEventDto;
    showAgo: boolean;
}) {
    const path = SUBJECT_PATH[event.type];
    const label = event.game?.name ?? event.subject?.name ?? '';
    // Slot events name the slot in the sentence, not as a link
    const name =
        path && event.subject?.id != null ? (
            <Link to={`/u/${username}/${path}/${event.subject.id}`}>
                <strong>{label}</strong>
            </Link>
        ) : event.game ? (
            <Link to={`/u/${username}/games/${event.game.id}`}>
                <strong>{label}</strong>
            </Link>
        ) : (
            <strong>{label}</strong>
        );
    return (
        <li className="activity__item">
            {event.game ? (
                <span className="activity__cover">
                    <Cover imageId={event.game.coverImageId} name={event.game.name} />
                </span>
            ) : (
                <span className="activity__icon" aria-hidden="true">
                    {ICONS[event.type]}
                </span>
            )}
            <span className="activity__text">{sentence(event, name)}</span>
            <When at={event.at} showAgo={showAgo} />
        </li>
    );
}

/** "5 minutes ago" under today's heading; older days are already dated by theirs. */
function When({ at, showAgo }: { at: number; showAgo: boolean }) {
    const when = new Date(at);
    return (
        <time
            className="activity__when muted"
            dateTime={when.toISOString()}
            title={when.toLocaleString()}
        >
            {showAgo ? timeAgo(at) : ''}
        </time>
    );
}

/** "Added 12 games to the collection" and so on; the singular never happens (bursts are 3+). */
function burstSentence(type: ActivityType, n: number): string {
    switch (type) {
        case 'added':
            return `Added ${n} games to the collection`;
        case 'favorited':
            return `Made ${n} games favorites`;
        case 'wishlisted':
            return `Wishlisted ${n} games`;
        case 'queued':
            return `Queued ${n} games`;
        case 'rated':
            return `Rated ${n} games`;
        default:
            return `${ACTIVITY_VERBS[type]} ${n} games`;
    }
}

const COVERS_SHOWN = 4;

/** A run of the same action on several games: one row that opens to list them. */
function BurstRow({
    username,
    item,
    showAgo
}: {
    username: string;
    item: Extract<ActivityItem, { kind: 'burst' }>;
    showAgo: boolean;
}) {
    return (
        <li className="activity__item activity__item--burst">
            <details>
                <summary>
                    <span className="activity__stack" aria-hidden="true">
                        {item.events.slice(0, COVERS_SHOWN).map((e) => (
                            <span key={e.id} className="activity__cover">
                                <Cover imageId={e.game!.coverImageId} name={e.game!.name} />
                            </span>
                        ))}
                    </span>
                    <span className="activity__text">
                        <strong>{burstSentence(item.type, item.events.length)}</strong>
                    </span>
                    <When at={item.at} showAgo={showAgo} />
                    <ChevronDown className="activity__chevron" aria-hidden="true" />
                </summary>
                <ul className="activity__burst-list">
                    {item.events.map((e) => (
                        <li key={e.id}>
                            <Link to={`/u/${username}/games/${e.game!.id}`}>{e.game!.name}</Link>
                            {e.type === 'rated' && e.detail !== null && (
                                <span className="muted">
                                    {' '}
                                    {e.detail}/{RATING_MAX}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </details>
        </li>
    );
}

/** The feed as days, each with its rows; long runs of one action are folded into a single row. */
export function ActivityDays({ username, days }: { username: string; days: ActivityDay[] }) {
    return (
        <div className="activity-days">
            {days.map((day) => (
                <section key={day.key} aria-label={day.label} className="activity-day">
                    <h3 className="activity-day__heading">{day.label}</h3>
                    <ul className="activity">
                        {day.items.map((item) =>
                            item.kind === 'burst' ? (
                                <BurstRow
                                    key={`b${item.events[0]!.id}`}
                                    username={username}
                                    item={item}
                                    showAgo={day.label === 'Today'}
                                />
                            ) : (
                                <ActivityRow
                                    key={item.event.id}
                                    username={username}
                                    event={item.event}
                                    showAgo={day.label === 'Today'}
                                />
                            )
                        )}
                    </ul>
                </section>
            ))}
        </div>
    );
}

/** A user's events, newest first, grouped by day, as the public profile page shows them. */
export function ActivityList({
    username,
    events
}: {
    username: string;
    events: ActivityEventDto[];
}) {
    const days = useMemo(() => groupActivity(events), [events]);
    return <ActivityDays username={username} days={days} />;
}

export function ActivitySkeletons({ count = 8 }: { count?: number }) {
    return (
        <ul className="activity" role="status" aria-label="Loading activity">
            {Array.from({ length: count }, (_, i) => (
                <li key={i} className="activity__item" aria-hidden="true">
                    <span className="skeleton activity__cover activity__cover--skeleton" />
                    <span className="activity__text">
                        <span
                            className="skeleton skeleton--line"
                            style={{ width: `${45 + ((i * 23) % 35)}%` }}
                        />
                    </span>
                    <span className="skeleton skeleton--line activity__when--skeleton" />
                </li>
            ))}
        </ul>
    );
}
