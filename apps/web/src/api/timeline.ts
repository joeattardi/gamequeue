import { useQuery } from '@tanstack/react-query';
import type { TimelineDto } from '@gamequeue/shared';
import { api } from './client';

/** The calendar's events and played days for a window of the viewer's local days. */
export const useTimeline = (scope: 'me' | { username: string }, from: string, to: string) => {
    const path = scope === 'me' ? '/stats/timeline' : `/profiles/${scope.username}/timeline`;
    return useQuery({
        queryKey:
            scope === 'me'
                ? ['timeline', from, to]
                : ['profile', scope.username, 'timeline', from, to],
        queryFn: async () =>
            (await api<{ timeline: TimelineDto }>(`${path}?from=${from}&to=${to}`)).timeline,
        retry: false
    });
};
