import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AvatarUploadInput, UserDto } from '@gamequeue/shared';
import { api } from './client';

/** The avatar shows in `me` and on the public profile, so both caches need the new version. */
function useAvatarMutation<V>(request: (v: V) => Promise<{ avatarUpdatedAt: number | null }>) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: ({ avatarUpdatedAt }) => {
            qc.setQueryData<UserDto | null>(['me'], (me) => (me ? { ...me, avatarUpdatedAt } : me));
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export const useUploadAvatar = () =>
    useAvatarMutation((input: AvatarUploadInput) =>
        api<{ avatarUpdatedAt: number }>('/avatar', { method: 'PUT', body: input })
    );

export const useRemoveAvatar = () =>
    useAvatarMutation((_: void) => api<{ avatarUpdatedAt: null }>('/avatar', { method: 'DELETE' }));
