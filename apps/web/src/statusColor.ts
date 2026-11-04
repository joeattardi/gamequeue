import type { EntryStatus } from '@gamequeue/shared';
import { statusLabel } from '@gamequeue/shared';

/** Everything that gets a status colour: the five stored states plus the wishlist (a list, not a state). */
export type StatusKey = EntryStatus | 'wishlist';

const TOKENS: Record<StatusKey, string> = {
    playing: '--status-playing',
    paused: '--status-paused',
    finished: '--status-finished',
    abandoned: '--status-abandoned',
    unplayed: '--status-notstarted',
    wishlist: '--status-wishlist'
};

/**
 * The one place that maps a game's state to its colour token. Returns a `var(...)` so it follows
 * the theme; use it for dots, bars and tints. "Up next" and "Backlog" are Not Started, not states
 * of their own, so they use `unplayed`.
 */
export const statusColor = (state: StatusKey): string => `var(${TOKENS[state]})`;

/** The text next to the dot, so colour is never the only cue. */
export const statusText = (state: StatusKey): string =>
    state === 'wishlist' ? 'Wishlist' : statusLabel(state);
