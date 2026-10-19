import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AddEntryInput,
    CloseInput,
    LogPlaythroughInput,
    PatchPlaythroughInput,
    PlaythroughDto,
    StartInput,
    StatusAction,
    EntryDto,
    FacetCountsDto,
    FacetsDto,
    GameDetailDto,
    PatchEntryInput,
    PlatformDto,
    SearchResultDto
} from '@gamequeue/shared';
import { api } from './client';

export function useEntries(params: URLSearchParams) {
    const qs = params.toString();
    return useQuery({
        queryKey: ['entries', qs],
        queryFn: async () =>
            (await api<{ entries: EntryDto[] }>(`/entries${qs ? `?${qs}` : ''}`)).entries,
        placeholderData: keepPreviousData
    });
}

/** Facet options with counts under the current filters (the view and search text included). */
export function useFacetCounts(params: URLSearchParams) {
    const qs = params.toString();
    return useQuery({
        queryKey: ['facets', 'counts', qs],
        queryFn: () => api<FacetCountsDto>(`/entries/facet-counts${qs ? `?${qs}` : ''}`),
        placeholderData: keepPreviousData
    });
}

export const useFacets = () =>
    useQuery({ queryKey: ['facets'], queryFn: () => api<FacetsDto>('/entries/facets') });

export const useEntry = (id: number) =>
    useQuery({
        queryKey: ['entry', id],
        queryFn: async () => (await api<{ entry: EntryDto }>(`/entries/${id}`)).entry
    });

export const useAllPlatforms = () =>
    useQuery({
        queryKey: ['platforms'],
        queryFn: async () => (await api<{ platforms: PlatformDto[] }>('/igdb/platforms')).platforms,
        staleTime: Infinity
    });

export function useGameSearch(q: string) {
    return useQuery({
        queryKey: ['search', q],
        queryFn: async () =>
            (await api<{ results: SearchResultDto[] }>(`/igdb/search?q=${encodeURIComponent(q)}`))
                .results,
        enabled: q.length >= 2,
        staleTime: 5 * 60_000,
        retry: false
    });
}

/** A game by IGDB id with the user's state; fetched from IGDB on the server only if never seen. */
export const useGameDetail = (igdbId: number) =>
    useQuery({
        queryKey: ['game', igdbId],
        queryFn: () => api<GameDetailDto>(`/igdb/games/${igdbId}`),
        retry: false
    });

const COLLECTION_KEYS = [
    'game',
    'entries',
    'entry',
    'facets',
    'search',
    'playthroughs',
    'slots',
    'lists',
    'list',
    'smartLists',
    'smartList',
    'queue',
    'wishlist'
];

export function useInvalidateCollection() {
    const qc = useQueryClient();
    return () => Promise.all(COLLECTION_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/**
 * Like useInvalidateCollection, for after deleting the thing a page is showing. Refetching that
 * page's own queries would 404, flip the page to its "not found" state and unmount it before the
 * caller can navigate away, so those queries are left alone.
 */
export function useInvalidateAfterDelete(...gone: (readonly unknown[])[]) {
    const qc = useQueryClient();
    return () =>
        qc.invalidateQueries({
            predicate: ({ queryKey }) =>
                COLLECTION_KEYS.includes(queryKey[0] as string) &&
                !gone.some((key) => key.every((part, i) => queryKey[i] === part))
        });
}

export function useAddEntry() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (input: AddEntryInput) =>
            (await api<{ entry: EntryDto }>('/entries', { method: 'POST', body: input })).entry,
        onSuccess: invalidate
    });
}

export function usePatchEntry(id: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (patch: PatchEntryInput) =>
            (await api<{ entry: EntryDto }>(`/entries/${id}`, { method: 'PATCH', body: patch }))
                .entry,
        onSuccess: invalidate
    });
}

export function useDeleteEntry(id: number) {
    const invalidate = useInvalidateAfterDelete(['entry', id], ['playthroughs', id]);
    return useMutation({
        mutationFn: () => api(`/entries/${id}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}

export const usePlaythroughs = (entryId: number) =>
    useQuery({
        queryKey: ['playthroughs', entryId],
        queryFn: async () =>
            (await api<{ playthroughs: PlaythroughDto[] }>(`/entries/${entryId}/playthroughs`))
                .playthroughs
    });

type ActionBody = StartInput | CloseInput | undefined;

/** start / pause / resume / finish / abandon */
export function useEntryAction(entryId: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (v: { action: StatusAction; body?: ActionBody }) =>
            (
                await api<{ entry: EntryDto }>(`/entries/${entryId}/${v.action}`, {
                    method: 'POST',
                    body: v.body ?? {}
                })
            ).entry,
        onSuccess: invalidate
    });
}

export function useLogPlaythrough(entryId: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (input: LogPlaythroughInput) =>
            (
                await api<{ entry: EntryDto }>(`/entries/${entryId}/playthroughs`, {
                    method: 'POST',
                    body: input
                })
            ).entry,
        onSuccess: invalidate
    });
}

export function usePatchPlaythrough() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (v: { id: number; patch: PatchPlaythroughInput }) =>
            (
                await api<{ entry: EntryDto }>(`/playthroughs/${v.id}`, {
                    method: 'PATCH',
                    body: v.patch
                })
            ).entry,
        onSuccess: invalidate
    });
}

export function useDeletePlaythrough() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (id: number) =>
            (await api<{ entry: EntryDto }>(`/playthroughs/${id}`, { method: 'DELETE' })).entry,
        onSuccess: invalidate
    });
}
