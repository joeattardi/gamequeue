import { useQuery } from '@tanstack/react-query';
import type { ProfileDto, ProfileQueueDto } from '@gamequeue/shared';
import { api } from './client';

export const useProfile = (username: string) =>
    useQuery({
        queryKey: ['profile', username],
        queryFn: async () => (await api<{ profile: ProfileDto }>(`/profiles/${username}`)).profile,
        retry: false
    });

export const useProfileQueue = (username: string) =>
    useQuery({
        queryKey: ['profile', username, 'queue'],
        queryFn: async () =>
            (await api<{ queue: ProfileQueueDto }>(`/profiles/${username}/queue`)).queue,
        retry: false
    });
