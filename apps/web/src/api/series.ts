import { useMutation, useQuery } from '@tanstack/react-query';
import type { QueueSeriesResultDto, SeriesDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';

export const useSeries = (id: number) =>
    useQuery({
        queryKey: ['series', id],
        queryFn: async () => (await api<{ series: SeriesDto }>(`/series/${id}`)).series
    });

export function useQueueSeries(id: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: () => api<QueueSeriesResultDto>(`/series/${id}/queue`, { method: 'POST' }),
        onSuccess: invalidate
    });
}
