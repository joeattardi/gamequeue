import { useQuery } from '@tanstack/react-query';
import type { EntriesPageDto, ListDetailDto } from '@gamequeue/shared';
import { api } from './client';
import { useWishlistCount } from './wishlist';

/**
 * How many games wait in the backlog, queue and wishlist, for the sidebar. Each asks for a single
 * game and reads `total`; the keys sit under the collection's groups, so any change refreshes them.
 */
export function useNavCounts() {
    const backlog = useQuery({
        queryKey: ['entries', 'count', 'backlog'],
        queryFn: async () => (await api<EntriesPageDto>('/entries?view=backlog&limit=1')).total
    });
    const queue = useQuery({
        queryKey: ['queue', 'count'],
        queryFn: async () => (await api<{ list: ListDetailDto }>('/queue?limit=1')).list.total
    });
    const wishlist = useWishlistCount();
    return { backlog: backlog.data, queue: queue.data, wishlist: wishlist.data };
}
