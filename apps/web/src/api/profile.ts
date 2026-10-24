import { useQuery } from '@tanstack/react-query';
import type {
    ActivityPageDto,
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

/** One of a user's lists on their profile, a page at a time. */
export const useProfileList = (username: string, kind: 'lists' | 'smart-lists', id: number) =>
    usePagedQuery({
        key: ['profile', username, kind, id],
        load: (offset, limit) =>
            api<ProfileListPageDto>(withPage(`/profiles/${username}/${kind}/${id}`, offset, limit)),
        read: (p) => ({ items: p.entries, total: p.total }),
        retry: false
    });

export const useProfileActivity = (username: string) =>
    usePagedQuery({
        key: ['profile', username, 'activity'],
        load: async (offset, limit) =>
            (
                await api<{ activity: ActivityPageDto }>(
                    withPage(`/profiles/${username}/activity`, offset, limit)
                )
            ).activity,
        read: (a) => ({ items: a.events, total: a.total }),
        retry: false
    });
