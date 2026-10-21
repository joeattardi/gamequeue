import { useQuery } from '@tanstack/react-query';
import type {
    ProfileDto,
    ProfileGamesDto,
    ProfileListPageDto,
    ProfileView,
    ProfileWishlistDto
} from '@gamequeue/shared';
import { api } from './client';
import { usePagedQuery, withPage } from './paging';

export const useProfile = (username: string) =>
    useQuery({
        queryKey: ['profile', username],
        queryFn: async () => (await api<{ profile: ProfileDto }>(`/profiles/${username}`)).profile,
        retry: false
    });

/** `year` only applies to the finished view (`/finished/:year`). */
export const useProfileGames = (
    username: string,
    view: ProfileView,
    enabled = true,
    year?: string
) =>
    usePagedQuery({
        key: ['profile', username, view, year ?? null],
        load: async (offset, limit) =>
            (
                await api<{ games: ProfileGamesDto }>(
                    withPage(
                        `/profiles/${username}/${view}${year ? `/${year}` : ''}`,
                        offset,
                        limit
                    )
                )
            ).games,
        read: (g) => ({ items: g.entries, total: g.total }),
        retry: false,
        enabled
    });

export const useProfileWishlist = (username: string) =>
    usePagedQuery({
        key: ['profile', username, 'wishlist'],
        load: async (offset, limit) =>
            (
                await api<{ wishlist: ProfileWishlistDto }>(
                    withPage(`/profiles/${username}/wishlist`, offset, limit)
                )
            ).wishlist,
        read: (w) => ({ items: w.items, total: w.total }),
        retry: false
    });

/**
 * The rest of one list on the profile, past the preview the profile carries. Starts at `start`
 * (the preview's length) and is only fetched once `enabled` (the visitor asked for more).
 */
export const useProfileListRest = (
    username: string,
    kind: 'lists' | 'smart-lists',
    id: number,
    start: number,
    enabled: boolean
) =>
    usePagedQuery({
        key: ['profile', username, kind, id],
        load: (offset, limit) =>
            api<ProfileListPageDto>(
                withPage(`/profiles/${username}/${kind}/${id}`, start + offset, limit)
            ),
        read: (p) => ({ items: p.entries, total: p.total - start }),
        enabled
    });
