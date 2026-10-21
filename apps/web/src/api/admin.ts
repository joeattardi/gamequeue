import { useQuery } from '@tanstack/react-query';
import type { BackupReportDto } from '@gamequeue/shared';
import { api } from './client';

export const useAdminBackup = () =>
    useQuery({
        queryKey: ['admin', 'backup'],
        queryFn: () => api<BackupReportDto>('/admin/backup'),
        // The nightly run is the only thing that changes this; refresh when returning to the tab
        refetchOnWindowFocus: true
    });
