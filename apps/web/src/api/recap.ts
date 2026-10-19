import { useQuery } from '@tanstack/react-query';
import type { RecapDto } from '@gamequeue/shared';
import { api } from './client';

const suffix = (year?: string) => (year ? `?year=${encodeURIComponent(year)}` : '');

/** `year` omitted: the server picks this year, or the latest one with activity. */
export const useRecap = (year?: string) =>
    useQuery({
        queryKey: ['recap', year ?? 'default'],
        queryFn: async () => (await api<{ recap: RecapDto }>(`/recap${suffix(year)}`)).recap,
        retry: false
    });

export const useProfileRecap = (username: string, year?: string) =>
    useQuery({
        queryKey: ['profile', username, 'recap', year ?? 'default'],
        queryFn: async () =>
            (await api<{ recap: RecapDto }>(`/profiles/${username}/recap${suffix(year)}`)).recap,
        retry: false
    });
