import { z } from 'zod';
import type { ActivityEventDto, ActivityType } from './activity.js';
import { isoDateSchema } from './playthroughs.js';

/** `GET .../timeline?from=YYYY-MM-DD&to=YYYY-MM-DD`: the viewer's local days, so the server can't bucket them. */
export const timelineQuerySchema = z
    .object({ from: isoDateSchema, to: isoDateSchema })
    .refine((q) => q.from <= q.to, 'from must not be after to');
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

/** A playthrough that covers days in the window: a game that was being played. */
export interface TimelinePlayingDto {
    game: { id: number; name: string };
    /** YYYY-MM-DD */
    start: string;
    /** YYYY-MM-DD; the last day played. For a playthrough still open, today (the server's) */
    end: string;
}

export interface TimelineDto {
    /** Oldest first, a day or two wider than the window so the client can cut at its own midnight */
    events: ActivityEventDto[];
    playing: TimelinePlayingDto[];
}

/** What the calendar colours a day by: one hue per group, split when a day has several. */
export const TIMELINE_GROUPS = ['finished', 'played', 'collected'] as const;
export type TimelineGroup = (typeof TIMELINE_GROUPS)[number];

export const TIMELINE_GROUP_LABELS: Record<TimelineGroup, string> = {
    finished: 'Finished or abandoned',
    played: 'Started, paused or resumed',
    collected: 'Added, rated or organised'
};

export function timelineGroupOf(type: ActivityType): TimelineGroup {
    switch (type) {
        case 'finished':
        case 'abandoned':
            return 'finished';
        case 'started':
        case 'paused':
        case 'resumed':
        case 'slotted':
            return 'played';
        default:
            return 'collected';
    }
}
