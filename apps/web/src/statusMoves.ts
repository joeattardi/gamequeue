import type { EntryStatus, StatusAction } from '@gamequeue/shared';

/** What it takes to move a game to another status, in terms of the actions the server already has. */
export type Move =
    /** Opens a playthrough; `paused` opens it already paused (a game you started before tracking it) */
    | { kind: 'start'; paused: boolean }
    | { kind: 'pause' }
    | { kind: 'resume' }
    /** Opens the finish dialog (date, time, rating, final thoughts) */
    | { kind: 'finish' }
    /** Opens the small abandon form */
    | { kind: 'abandon' }
    /** A game never started, logged as abandoned in one step */
    | { kind: 'logAbandoned' };

/** The order of the segmented status control. */
export const STATUS_ORDER: EntryStatus[] = [
    'unplayed',
    'playing',
    'paused',
    'finished',
    'abandoned'
];

/**
 * The move from one status to another, or null when the app has no such move (for example a
 * finished game can only be played again; a game you never played can't be "not started" again or
 * finished without a playthrough, which is what "Log a past playthrough" is for).
 */
export function moveTo(from: EntryStatus, to: EntryStatus): Move | null {
    switch (from) {
        case 'unplayed':
            if (to === 'playing') return { kind: 'start', paused: false };
            if (to === 'paused') return { kind: 'start', paused: true };
            if (to === 'abandoned') return { kind: 'logAbandoned' };
            return null;
        case 'playing':
            if (to === 'paused') return { kind: 'pause' };
            if (to === 'finished') return { kind: 'finish' };
            if (to === 'abandoned') return { kind: 'abandon' };
            return null;
        case 'paused':
            if (to === 'playing') return { kind: 'resume' };
            if (to === 'finished') return { kind: 'finish' };
            if (to === 'abandoned') return { kind: 'abandon' };
            return null;
        case 'finished':
        case 'abandoned':
            return to === 'playing' ? { kind: 'start', paused: false } : null;
    }
}

/** The one contextual primary button: what you most likely want to do with a game in this status. */
export function primaryAction(status: EntryStatus): { label: string; move: Move } {
    switch (status) {
        case 'unplayed':
            return { label: 'Start playing', move: { kind: 'start', paused: false } };
        case 'paused':
            return { label: 'Resume', move: { kind: 'resume' } };
        case 'playing':
            return { label: 'Mark finished', move: { kind: 'finish' } };
        case 'finished':
        case 'abandoned':
            return { label: 'Play again', move: { kind: 'start', paused: false } };
    }
}

/** The server action a move ends up calling, for checking against the status rules in shared. */
export function actionOf(move: Move): StatusAction | null {
    switch (move.kind) {
        case 'start':
            return 'start';
        case 'pause':
            return 'pause';
        case 'resume':
            return 'resume';
        case 'finish':
            return 'finish';
        case 'abandon':
            return 'abandon';
        case 'logAbandoned':
            return null;
    }
}
