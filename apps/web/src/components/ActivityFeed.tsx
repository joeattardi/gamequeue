import { RATING_MAX, type ActivityEventDto, type ActivityType } from '@gamequeue/shared';
import {
    Ban,
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
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { timeAgo } from '../lib';
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

function ActivityRow({ username, event }: { username: string; event: ActivityEventDto }) {
    const path = SUBJECT_PATH[event.type];
    const label = event.game?.name ?? event.subject?.name ?? '';
    // Slot events name the slot in the sentence, not as a link
    const name =
        path && event.subject?.id != null ? (
            <Link to={`/u/${username}/${path}/${event.subject.id}`}>{label}</Link>
        ) : event.game ? (
            <Link to={`/u/${username}/games/${event.game.id}`}>
                <strong>{label}</strong>
            </Link>
        ) : (
            <strong>{label}</strong>
        );
    const when = new Date(event.at);
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
            <time
                className="activity__when muted"
                dateTime={when.toISOString()}
                title={when.toLocaleString()}
            >
                {Date.now() - event.at < 14 * 86400_000
                    ? timeAgo(event.at)
                    : when.toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                      })}
            </time>
        </li>
    );
}

/** A user's events, newest first, as the public profile shows them. */
export function ActivityList({
    username,
    events
}: {
    username: string;
    events: ActivityEventDto[];
}) {
    return (
        <ul className="activity">
            {events.map((e) => (
                <ActivityRow key={e.id} username={username} event={e} />
            ))}
        </ul>
    );
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
