import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    AdminCreateUserInput,
    AdminResetPasswordInput,
    AdminUpdateUserInput,
    AdminUserDto,
    BackupReportDto
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
