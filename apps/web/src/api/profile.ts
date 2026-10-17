import { useQuery } from '@tanstack/react-query';
import type { ProfileDto } from '@gamequeue/shared';
import { api } from './client';

export const useProfile = (username: string) =>
    useQuery({
        queryKey: ['profile', username],
        queryFn: async () => (await api<{ profile: ProfileDto }>(`/profiles/${username}`)).profile,
        retry: false
    });
