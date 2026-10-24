import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AddNoteInput,
    AddEntryInput,
    CloseInput,
    LogPlaythroughInput,
    PatchPlaythroughInput,
    PlaythroughDto,
    StartInput,
    StatusAction,
    EntriesPageDto,
    EntryDto,
    FacetCountsDto,
    FacetsDto,
    GameDetailDto,
    GameOffersResponse,
    SimilarGameDto,
    PatchEntryInput,
    PatchNoteInput,
    PlatformDto,
    SearchResultDto
} from '@gamequeue/shared';
import { api } from './client';
import { usePagedQuery, withPage } from './paging';

const entriesPath = (params: URLSearchParams) => {
    const qs = params.toString();
    return `/entries${qs ? `?${qs}` : ''}`;
};

/** The collection or backlog a page at a time ("Load more"). */
export function usePagedEntries(params: URLSearchParams) {
    const path = entriesPath(params);
    return usePagedQuery({
        key: ['entries', 'paged', params.toString()],
        load: (offset, limit) => api<EntriesPageDto>(withPage(path, offset, limit)),
        read: (r) => ({ items: r.entries, total: r.total }),
        placeholder: true
    });
}

/** The first `limit` matches (and how many there are), for search-as-you-type pickers. */
export function useEntries(params: URLSearchParams, limit = 8) {
    const path = entriesPath(params);
    return useQuery({
        queryKey: ['entries', 'first', params.toString(), limit],
        queryFn: () => api<EntriesPageDto>(withPage(path, 0, limit)),
        placeholderData: keepPreviousData
    });
}

/** Games to put in a slot: queue first, then in progress, then the backlog; searchable. */
export function useSlotCandidates(q: string, excludeEntryId?: number) {
    const base = `/entries/candidates?${new URLSearchParams({
        ...(q ? { q } : {}),
        ...(excludeEntryId ? { exclude: String(excludeEntryId) } : {})
    })}`;
    return usePagedQuery({
        key: ['entries', 'candidates', q, excludeEntryId ?? null],
        load: (offset, limit) => api<EntriesPageDto>(withPage(base, offset, limit)),
        read: (r) => ({ items: r.entries, total: r.total }),
        placeholder: true
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

/** A game by IGDB id with the user's state; looked up on the server (IGDB mirror or IGDB) only if never seen. */
export const useGameDetail = (igdbId: number) =>
    useQuery({
        queryKey: ['game', igdbId],
        queryFn: () => api<GameDetailDto>(`/igdb/games/${igdbId}`),
        retry: false
    });

/** Games IGDB lists as similar; separate from the detail so it never delays the page. */
export const useSimilarGames = (igdbId: number) =>
    useQuery({
        queryKey: ['similar-games', igdbId],
        queryFn: async () =>
            (await api<{ games: SimilarGameDto[] }>(`/igdb/games/${igdbId}/similar`)).games,
        staleTime: 30 * 60_000,
        retry: false
    });

/** Every shop's price for a game; separate from the detail so ITAD never delays the page. */
export const useGameOffers = (igdbId: number) =>
    useQuery({
        queryKey: ['game-offers', igdbId],
        queryFn: () => api<GameOffersResponse>(`/igdb/games/${igdbId}/prices`),
        staleTime: 30 * 60_000,
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
    'wishlist',
    'discover',
    'series',
    'stats'
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

export function useNoteMutations(entryId: number) {
    const invalidate = useInvalidateCollection();
    const base = `/entries/${entryId}/notes`;
    const entry = async (p: Promise<{ entry: EntryDto }>) => (await p).entry;
    return {
        add: useMutation({
            mutationFn: (input: AddNoteInput) =>
                entry(api<{ entry: EntryDto }>(base, { method: 'POST', body: input })),
            onSuccess: invalidate
        }),
        patch: useMutation({
            mutationFn: ({ id, ...patch }: PatchNoteInput & { id: number }) =>
                entry(api<{ entry: EntryDto }>(`${base}/${id}`, { method: 'PATCH', body: patch })),
            onSuccess: invalidate
        }),
        remove: useMutation({
            mutationFn: (id: number) =>
                entry(api<{ entry: EntryDto }>(`${base}/${id}`, { method: 'DELETE' })),
            onSuccess: invalidate
        })
    };
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
