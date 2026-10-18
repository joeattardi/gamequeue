import { useQuery } from '@tanstack/react-query';
import type {
    ProfileDto,
    ProfileGamesDto,
    ProfileView,
    ProfileWishlistDto
} from '@gamequeue/shared';
import { api } from './client';

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
    useQuery({
        queryKey: ['profile', username, view, year ?? null],
        queryFn: async () =>
            (
                await api<{ games: ProfileGamesDto }>(
                    `/profiles/${username}/${view}${year ? `/${year}` : ''}`
                )
            ).games,
        retry: false,
        enabled
    });

export const useProfileWishlist = (username: string) =>
    useQuery({
        queryKey: ['profile', username, 'wishlist'],
        queryFn: async () =>
            (await api<{ wishlist: ProfileWishlistDto }>(`/profiles/${username}/wishlist`))
                .wishlist,
        retry: false
    });
