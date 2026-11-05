import { type EntryDto, type EntryStatus, ENTRY_STATUSES } from '@gamequeue/shared';
import { formatMinutes } from './lib';
import type { StatusKey } from './statusColor';

/** The Collection's tabs: everything, one status, or the wishlist (a list, not a status). */
export type TabKey = 'all' | StatusKey;

export const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'playing', label: 'Playing' },
    { key: 'paused', label: 'Paused' },
    { key: 'finished', label: 'Finished' },
    { key: 'abandoned', label: 'Abandoned' },
    { key: 'unplayed', label: 'Not Started' },
    { key: 'wishlist', label: 'Wishlist' }
];

/** The tab the address asks for: `?status=playing`; anything else (or several statuses) is All. */
export function tabFromParams(params: URLSearchParams): TabKey {
    const values = params.getAll('status');
    if (values.length !== 1) return 'all';
    const v = values[0]!;
    return v === 'wishlist' || (ENTRY_STATUSES as readonly string[]).includes(v)
        ? (v as TabKey)
        : 'all';
}

/** What to ask the entries API: the tab's status (the wishlist has none), the default sort, nothing else changed. */
export function apiParams(params: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(params);
    if (tabFromParams(params) === 'wishlist') next.delete('status');
    if (!next.get('sort')) next.set('sort', DEFAULT_SORT);
    return next;
}

/** Counts for the tabs. The server computes each status count with every other filter applied, so All is their sum. */
export function tabCounts(
    statuses: { value: EntryStatus; count: number }[] | undefined,
    wishlist: number | undefined
): Partial<Record<TabKey, number>> {
    const counts: Partial<Record<TabKey, number>> = {};
    if (statuses) {
        for (const s of statuses) counts[s.value] = s.count;
        for (const s of ENTRY_STATUSES) counts[s] ??= 0;
        counts.all = statuses.reduce((n, s) => n + s.count, 0);
    }
    if (wishlist !== undefined) counts.wishlist = wishlist;
    return counts;
}

export const DEFAULT_SORT = 'added';

export const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'added', label: 'Recently added' },
    { value: 'title', label: 'Title (A to Z)' },
    { value: 'igdb', label: 'IGDB score' },
    { value: 'release', label: 'Release date' },
    { value: 'rating', label: 'My rating' },
    { value: 'ttb', label: 'Time to beat' }
];

export type Density = 'wall' | 'grid' | 'list';

/** Whether the wall can work: it needs hover and room, so touch screens and phones get the grid. */
export const canShowWall = (env: { touch: boolean; narrow: boolean }) => !env.touch && !env.narrow;

/** What a user sees first: the wall where it works, the grid where it doesn't. */
export const defaultDensity = (env: { touch: boolean; narrow: boolean }): Density =>
    canShowWall(env) ? 'wall' : 'grid';

/**
 * The layout actually drawn for a saved choice. The choice itself is kept: a wall chosen on a
 * desktop is still the choice after a trip on the phone, which just draws the grid.
 */
export const effectiveDensity = (
    saved: Density | null,
    env: { touch: boolean; narrow: boolean }
): Density => {
    const fallback = defaultDensity(env);
    if (saved === null) return fallback;
    return saved === 'wall' && !canShowWall(env) ? 'grid' : saved;
};

export const parseDensity = (raw: string | null): Density | null =>
    raw === 'wall' || raw === 'grid' || raw === 'list' ? raw : null;

/** "PC / PS5", with "+N" past two. */
export function platformText(platforms: { name: string; abbreviation: string | null }[]): string {
    const names = platforms.map((p) => p.abbreviation ?? p.name);
    if (names.length <= 2) return names.join(' / ');
    return `${names.slice(0, 2).join(' / ')} +${names.length - 2}`;
}

/**
 * The one meta line under a cover: where you own it, then one fact that is true of its state. Hours
 * appear only when the journal recorded some; nothing is estimated or made up.
 */
export function entryMetaParts(entry: EntryDto): string[] {
    const parts: string[] = [];
    const platforms = platformText(entry.platforms);
    if (platforms) parts.push(platforms);
    const logged = entry.openPlaythrough?.loggedMinutes ?? 0;
    if ((entry.status === 'playing' || entry.status === 'paused') && logged > 0)
        parts.push(`${formatMinutes(logged)} logged`);
    else if (entry.status === 'unplayed' && entry.ttbMinutes)
        parts.push(`~${formatMinutes(entry.ttbMinutes)} to beat`);
    else if (entry.status === 'finished' && entry.lastFinishedOn)
        parts.push(`Finished ${entry.lastFinishedOn.slice(0, 4)}`);
    if (entry.rating !== null) parts.push(`★ ${entry.rating}`);
    return parts;
}

/** A facet shows as a dropdown only when it offers a choice (or has one selected, so it can be cleared). */
export const showFacet = (optionCount: number, selectedCount: number) =>
    optionCount > 1 || selectedCount > 0;

/** "Platform", "Platform: PC", "Platform: 2 selected". */
export function facetButtonLabel(title: string, selected: string[]): string {
    if (selected.length === 0) return title;
    return selected.length === 1 ? `${title}: ${selected[0]}` : `${title}: ${selected.length}`;
}

/** A hue from a name, so a cover with no art still gets its own colour. */
export function hueOf(name: string): number {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
}

/** Which quick action a wall tile offers: start, continue or resume (and play again after a finish). */
export type QuickAction = 'start' | 'continue' | 'resume' | 'again';
export function quickAction(status: EntryStatus): QuickAction {
    switch (status) {
        case 'unplayed':
            return 'start';
        case 'playing':
            return 'continue';
        case 'paused':
            return 'resume';
        default:
            return 'again';
    }
}

/** The + button (add to the queue) makes sense unless the game is queued or already being played. */
export const canQueue = (entry: Pick<EntryDto, 'queued' | 'status'>) =>
    !entry.queued && entry.status !== 'playing';
