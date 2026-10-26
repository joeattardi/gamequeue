import { useQuery } from '@tanstack/react-query';
import type { EntriesPageDto, ListDetailDto } from '@gamequeue/shared';
import { api } from './client';
import { useLists } from './lists';
import { useSmartLists } from './smartLists';
import { useWishlistCount } from './wishlist';

/**
 * The sidebar's badges: games in the collection, backlog, queue and wishlist, and how many lists
 * the user has (plain and smart, not the queue). The game counts each ask for a single game and
 * read `total`; the lists reuse the lists page's own queries. All keys sit under the collection's
 * groups, so any change refreshes them.
 */
export function useNavCounts() {
    const collection = useQuery({
        queryKey: ['entries', 'count', 'all'],
        queryFn: async () => (await api<EntriesPageDto>('/entries?view=all&limit=1')).total
    });
    const lists = useLists();
    const smartLists = useSmartLists();
    const backlog = useQuery({
        queryKey: ['entries', 'count', 'backlog'],
        queryFn: async () => (await api<EntriesPageDto>('/entries?view=backlog&limit=1')).total
    });
    const queue = useQuery({
        queryKey: ['queue', 'count'],
        queryFn: async () => (await api<{ list: ListDetailDto }>('/queue?limit=1')).list.total
    });
    const wishlist = useWishlistCount();
    const listCount =
        lists.data && smartLists.data ? lists.data.length + smartLists.data.length : undefined;
    return {
        collection: collection.data,
        backlog: backlog.data,
        queue: queue.data,
        wishlist: wishlist.data,
        lists: listCount
    };
}
