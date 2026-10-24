import { z } from 'zod';

/** What a user did, as shown in the activity feed on their public profile. */
export const ACTIVITY_TYPES = [
    'added',
    'started',
    'paused',
    'resumed',
    'finished',
    'abandoned',
    'rated',
    'favorited',
    'queued',
    'slotted',
    'wishlisted',
    'grid',
    'tier',
    'list',
    'smartlist'
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityEventDto {
    id: number;
    type: ActivityType;
    /** ms since epoch */
    at: number;
    /** The game the event is about; null for grids, tier lists and lists */
    game: { id: number; name: string; coverImageId: string | null } | null;
    /** Grid, tier list, list or smart list for the `grid`/`tier`/`list`/`smartlist` types; the slot name for `slotted` */
    subject: { id: number | null; name: string } | null;
    /** `rated`: the stars given */
    detail: number | null;
}

/** `GET /profiles/:username/activity`, a page at a time. */
export interface ActivityPageDto {
    username: string;
    events: ActivityEventDto[];
    total: number;
}

/** Whether the activity feed is shown on the public profile (default on). */
export const activityVisibilitySchema = z.object({ showActivity: z.boolean() });
export type ActivityVisibilityInput = z.infer<typeof activityVisibilitySchema>;

/** The feed in words, e.g. "Started Hades" (the game or subject name is added by the caller). */
export const ACTIVITY_VERBS: Record<ActivityType, string> = {
    added: 'Added to collection',
    started: 'Started',
    paused: 'Paused',
    resumed: 'Resumed',
    finished: 'Finished',
    abandoned: 'Abandoned',
    rated: 'Rated',
    favorited: 'Favorited',
    queued: 'Queued',
    slotted: 'Moved to a slot',
    wishlisted: 'Wishlisted',
    grid: 'Created grid',
    tier: 'Created tier list',
    list: 'Created list',
    smartlist: 'Created smart list'
};
