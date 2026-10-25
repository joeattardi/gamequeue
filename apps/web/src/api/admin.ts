import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AdminCreateUserInput,
    AdminResetPasswordInput,
    AdminUpdateUserInput,
    AdminUserDto,
    BackupReportDto,
    AdminSettingsDto,
    AdminSettingsInput,
    DatabaseStatsDto,
    ErrorKind,
    ErrorsDto,
    IgdbPingDto,
    IgdbStatusDto,
    MirrorStatusDto,
    PurgeSessionsResult,
    PurgeUnusedGamesResult,
    ServerInfoDto,
    TrafficDto,
    VacuumResult
} from '@gamequeue/shared';
import { api } from './client';

export const useAdminBackup = () =>
    useQuery({
        queryKey: ['admin', 'backup'],
        queryFn: () => api<BackupReportDto>('/admin/backup'),
        // The nightly run is the only thing that changes this; refresh when returning to the tab
        refetchOnWindowFocus: true
    });

const usersKey = ['admin', 'users'] as const;

export const useAdminUsers = () =>
    useQuery({
        queryKey: usersKey,
        queryFn: () => api<{ users: AdminUserDto[] }>('/admin/users').then((r) => r.users)
    });

export const useAdminUser = (id: number) =>
    useQuery({
        queryKey: [...usersKey, id],
        queryFn: () => api<{ user: AdminUserDto }>(`/admin/users/${id}`).then((r) => r.user)
    });

export function useCreateAdminUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AdminCreateUserInput) =>
            api<{ user: AdminUserDto }>('/admin/users', { method: 'POST', body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: usersKey })
    });
}

export function useUpdateAdminUser(id: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AdminUpdateUserInput) =>
            api<{ user: AdminUserDto }>(`/admin/users/${id}`, { method: 'PATCH', body: input }),
        onSuccess: ({ user }) => {
            qc.setQueryData([...usersKey, id], user);
            qc.invalidateQueries({ queryKey: usersKey });
            // Editing yourself changes what /auth/me and your public profile show
            qc.invalidateQueries({ queryKey: ['me'] });
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export const useResetUserPassword = (id: number) =>
    useMutation({
        mutationFn: (input: AdminResetPasswordInput) =>
            api<{ ok: true }>(`/admin/users/${id}/password`, { method: 'PUT', body: input })
    });

export function useVerifyAdminUserEmail(id: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () =>
            api<{ user: AdminUserDto }>(`/admin/users/${id}/verify-email`, { method: 'POST' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: usersKey })
    });
}

export const useResendAdminUserVerification = (id: number) =>
    useMutation({
        mutationFn: () =>
            api<{ ok: true }>(`/admin/users/${id}/resend-verification`, { method: 'POST' })
    });

export function useDeleteAdminUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
        onSuccess: (_, id) => {
            qc.removeQueries({ queryKey: [...usersKey, id] });
            qc.invalidateQueries({ queryKey: usersKey });
        }
    });
}

export const useAdminDatabase = () =>
    useQuery({
        queryKey: ['admin', 'database'],
        queryFn: () => api<DatabaseStatsDto>('/admin/database'),
        refetchOnWindowFocus: true
    });

export const useAdminIgdb = () =>
    useQuery({
        queryKey: ['admin', 'igdb'],
        queryFn: () => api<IgdbStatusDto>('/admin/igdb'),
        refetchOnWindowFocus: true
    });

/** The local IGDB mirror: the file, the daily job's last run, and the cache sync. */
export const useAdminMirror = () =>
    useQuery({
        queryKey: ['admin', 'mirror'],
        queryFn: () => api<MirrorStatusDto>('/admin/mirror'),
        refetchOnWindowFocus: true
    });

/** Site traffic from Cloudflare (the server caches it for a few minutes). */
export const useAdminTraffic = () =>
    useQuery({
        queryKey: ['admin', 'traffic'],
        queryFn: () => api<TrafficDto>('/admin/traffic'),
        refetchOnWindowFocus: true,
        retry: false
    });

/** Live connectivity check; the counters change too, so they are refetched. */
export function usePingIgdb() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api<IgdbPingDto>('/admin/igdb/ping', { method: 'POST', body: {} }),
        onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'igdb'] })
    });
}

export const useAdminServer = () =>
    useQuery({
        queryKey: ['admin', 'server'],
        queryFn: () => api<ServerInfoDto>('/admin/server'),
        refetchOnWindowFocus: true
    });

export const useAdminSettings = () =>
    useQuery({
        queryKey: ['admin', 'settings'],
        queryFn: () => api<AdminSettingsDto>('/admin/settings')
    });

export function useUpdateAdminSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AdminSettingsInput) =>
            api<AdminSettingsDto>('/admin/settings', { method: 'PUT', body: input }),
        onSuccess: (settings) => {
            qc.setQueryData(['admin', 'settings'], settings);
            // The login page reads the public flag
            qc.invalidateQueries({ queryKey: ['auth-config'] });
        }
    });
}

/** The three housekeeping actions; each refreshes the database figures it changes. */
function useMaintenance<T>(action: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api<T>(`/admin/maintenance/${action}`, { method: 'POST', body: {} }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin', 'database'] });
            qc.invalidateQueries({ queryKey: ['admin', 'server'] });
        }
    });
}
export const usePurgeUnusedGames = () => useMaintenance<PurgeUnusedGamesResult>('purge-games');
export const usePurgeSessions = () => useMaintenance<PurgeSessionsResult>('purge-sessions');
export const useVacuum = () => useMaintenance<VacuumResult>('vacuum');

export const useAdminErrors = (kind: ErrorKind | undefined, limit = 50) =>
    useQuery({
        queryKey: ['admin', 'errors', kind ?? 'all', limit],
        queryFn: () =>
            api<ErrorsDto>(
                `/admin/errors?limit=${limit}&tz=${new Date().getTimezoneOffset()}${kind ? `&kind=${kind}` : ''}`
            ),
        // Keeps the list on screen while a filter or "Load more" fetches
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: true
    });

export function useClearAdminErrors() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (kind?: ErrorKind) =>
            api<{ deleted: number }>(`/admin/errors${kind ? `?kind=${kind}` : ''}`, {
                method: 'DELETE',
                body: {}
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'errors'] })
    });
}
