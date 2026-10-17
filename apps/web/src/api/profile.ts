import { useQuery } from '@tanstack/react-query';
import type { ProfileDto, ProfileGamesDto, ProfileView } from '@gamequeue/shared';
import { api } from './client';

export const useProfile = (username: string) =>
    useQuery({
        queryKey: ['profile', username],
        queryFn: async () => (await api<{ profile: ProfileDto }>(`/profiles/${username}`)).profile,
        retry: false
    });

export const useProfileGames = (username: string, view: ProfileView, enabled = true) =>
    useQuery({
        queryKey: ['profile', username, view],
        queryFn: async () =>
            (await api<{ games: ProfileGamesDto }>(`/profiles/${username}/${view}`)).games,
        retry: false,
        enabled
    });
