import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiscoverDto } from '@gamequeue/shared';
import { api } from './client';

/** Suggestions from the games you love; the server caches IGDB's lists, so reloading is cheap. */
export const useDiscover = () =>
    useQuery({
        queryKey: ['discover'],
        queryFn: () => api<DiscoverDto>('/discover'),
        staleTime: 5 * 60_000,
        retry: false
    });

/** "Not interested" (and its undo): the game stops being suggested, or comes back. */
export function useDismissGame() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { igdbId: number; dismissed: boolean }) =>
            api(`/discover/dismissed/${v.igdbId}`, { method: v.dismissed ? 'PUT' : 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['discover'] })
    });
}
