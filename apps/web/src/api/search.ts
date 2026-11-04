import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { EntriesPageDto } from '@gamequeue/shared';
import { todayLocal } from '../lib';
import { MIN_QUERY, normalizeQuery } from '../searchModel';
import type { StatusKey } from '../statusColor';
import { api } from './client';
import { searchIgdb, useEntries, useInvalidateQuietly } from './collection';

/** How many library matches the search asks for; the palette and phone list show what fits. */
const LIBRARY_LIMIT = 25;

/**
 * One search over the user's library (`GET /entries?q=`) and IGDB (`GET /igdb/search`), shared by
 * the ⌘K palette and the phone search page. Both parts are cached per query for five minutes, so a
 * repeated query never goes to IGDB again, and each reports its own loading state: the library
 * answers first and the IGDB group fills in below it.
 */
export function useUnifiedSearch(rawQuery: string) {
    const q = normalizeQuery(rawQuery);
    const enabled = q.length >= MIN_QUERY;
    const library = useQuery({
        queryKey: ['uni-library', q.toLowerCase()],
        queryFn: () =>
            api<EntriesPageDto>(
                `/entries?q=${encodeURIComponent(q)}&sort=title&limit=${LIBRARY_LIMIT}`
            ),
        enabled,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
        retry: false
    });
    // Same key and function as useGameSearch, so the cache is shared; this one keeps the last results while typing
    const igdb = useQuery({
        queryKey: ['search', q],
        queryFn: () => searchIgdb(q),
        enabled,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
        retry: false
    });
    return {
        q,
        enabled,
        entries: library.data?.entries ?? [],
        igdbResults: igdb.data ?? [],
        libraryLoading: enabled && library.isPending,
        igdbLoading: enabled && igdb.isPending,
        libraryError: library.isError,
        igdbError: igdb.isError ? igdb.error : null
    };
}

/** How a game can be added from a search result (the "Add it as" choice). */
export type AddAs = 'playing' | 'upnext' | 'notstarted' | 'wishlist';

export const ADD_AS_OPTIONS: { value: AddAs; label: string; hint: string; button: string }[] = [
    { value: 'playing', label: 'Play now', hint: 'Starts today', button: 'Start playing' },
    { value: 'upnext', label: 'Up next', hint: 'End of your queue', button: 'Add to Up next' },
    { value: 'notstarted', label: 'Not started', hint: 'Just save it', button: 'Add to library' },
    { value: 'wishlist', label: 'Wishlist', hint: "Don't own it yet", button: 'Add to Wishlist' }
];

/** The status a game shows after being added that way. */
export const addedStatus = (as: AddAs): StatusKey =>
    as === 'playing' ? 'playing' : as === 'wishlist' ? 'wishlist' : 'unplayed';

export interface QuickAddInput {
    igdbId: number;
    name: string;
    /** Already on the wishlist: adding it to the library takes it off, so undo puts it back */
    wishlisted: boolean;
    platformIds: number[];
    as: AddAs;
}

export interface QuickAddResult {
    entryId: number | null;
    status: StatusKey;
}

/**
 * Adds a game without leaving the page. Play now starts a playthrough today, Up next appends to the
 * queue, Not started just saves it, Wishlist adds it to the wishlist (no collection entry).
 */
export function useQuickAdd() {
    const invalidate = useInvalidateQuietly();
    return useMutation({
        mutationFn: async (input: QuickAddInput): Promise<QuickAddResult> => {
            if (input.as === 'wishlist') {
                await api('/wishlist/items', {
                    method: 'POST',
                    body: { igdbId: input.igdbId, platformId: input.platformIds[0] ?? null }
                });
                return { entryId: null, status: 'wishlist' };
            }
            const { entry } = await api<{ entry: { id: number } }>('/entries', {
                method: 'POST',
                body: {
                    igdbId: input.igdbId,
                    platformIds: input.platformIds,
                    ...(input.as === 'playing' ? { status: 'playing', date: todayLocal() } : {})
                }
            });
            if (input.as === 'upnext')
                await api('/queue/items', { method: 'POST', body: { igdbId: input.igdbId } });
            return { entryId: entry.id, status: addedStatus(input.as) };
        },
        onSuccess: invalidate
    });
}

/** Takes back a quick add: deletes the entry (which also leaves the queue) or leaves the wishlist. */
export function useUndoQuickAdd() {
    const invalidate = useInvalidateQuietly();
    return useMutation({
        mutationFn: async (v: { input: QuickAddInput; result: QuickAddResult }) => {
            if (v.result.entryId === null) {
                await api(`/wishlist/items/${v.input.igdbId}`, { method: 'DELETE' });
                return;
            }
            await api(`/entries/${v.result.entryId}`, { method: 'DELETE' });
            if (v.input.wishlisted)
                await api('/wishlist/items', { method: 'POST', body: { igdbId: v.input.igdbId } });
        },
        onSuccess: invalidate
    });
}

const NEWEST = new URLSearchParams({ sort: 'added', dir: 'desc' });

/** Platforms of the game the user added last, for preselecting a platform in quick add. */
export function useRecentPlatformIds(): number[] {
    const newest = useEntries(NEWEST, 1);
    return newest.data?.entries[0]?.platforms.map((p) => p.id) ?? [];
}
