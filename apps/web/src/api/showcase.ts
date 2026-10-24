import { useQuery } from '@tanstack/react-query';
import type { ShowcaseGameDto } from '@gamequeue/shared';
import { api } from './client';

/** Three random cached games for the landing page; picked once per visit, not reshuffled on refocus. */
export function useShowcase() {
    return useQuery({
        queryKey: ['showcase'],
        queryFn: async () => (await api<{ games: ShowcaseGameDto[] }>('/showcase')).games,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false
    });
}
