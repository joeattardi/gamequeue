import { useQuery } from '@tanstack/react-query';
import type { StatsDto } from '@gamequeue/shared';
import { api } from './client';

export const useStats = () =>
    useQuery({
        queryKey: ['stats'],
        queryFn: async () => (await api<{ stats: StatsDto }>('/stats')).stats
    });

export const useProfileStats = (username: string) =>
    useQuery({
        queryKey: ['profile', username, 'stats'],
        queryFn: async () => (await api<{ stats: StatsDto }>(`/profiles/${username}/stats`)).stats,
        retry: false
    });
