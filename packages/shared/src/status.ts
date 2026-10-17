import type { EntryStatus } from './collection.js';

export const STATUS_ACTIONS = ['start', 'pause', 'resume', 'finish', 'abandon'] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

const TRANSITIONS: Record<StatusAction, { from: readonly EntryStatus[]; to: EntryStatus }> = {
    // A replay is just another "start" from a terminal state
    start: { from: ['unplayed', 'finished', 'abandoned'], to: 'playing' },
    pause: { from: ['playing'], to: 'paused' },
    resume: { from: ['paused'], to: 'playing' },
    finish: { from: ['playing', 'paused'], to: 'finished' },
    abandon: { from: ['playing', 'paused'], to: 'abandoned' }
};

/** The status after applying an action, or null if the action isn't allowed from `status`. */
export function nextStatus(status: EntryStatus, action: StatusAction): EntryStatus | null {
    const t = TRANSITIONS[action];
    return t.from.includes(status) ? t.to : null;
}

export const availableActions = (status: EntryStatus): StatusAction[] =>
    STATUS_ACTIONS.filter((a) => nextStatus(status, a) !== null);

export interface HistoryItem {
    id: number;
    startedOn: string | null;
    endedOn: string | null;
    /** null while the playthrough is still open */
    outcome: 'finished' | 'abandoned' | null;
}

/**
 * Status after playthroughs were added, edited or removed.
 * An open playthrough keeps the entry playing/paused; otherwise the most recent closed one decides,
 * and an entry with no playthroughs at all is unplayed.
 */
export function statusFromHistory(current: EntryStatus, items: HistoryItem[]): EntryStatus {
    if (items.some((i) => i.outcome === null)) {
        return current === 'paused' ? 'paused' : 'playing';
    }
    const latest = [...items].sort(compareRecency)[0];
    return latest?.outcome ?? 'unplayed';
}

// Most recent first. Unknown dates sort as oldest; ties fall back to insertion order.
function compareRecency(a: HistoryItem, b: HistoryItem): number {
    const ka = a.endedOn ?? a.startedOn ?? '';
    const kb = b.endedOn ?? b.startedOn ?? '';
    return ka === kb ? b.id - a.id : ka < kb ? 1 : -1;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
