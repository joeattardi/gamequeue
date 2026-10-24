import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AvatarIconChoice, AvatarUploadInput, UserDto } from '@gamequeue/shared';
import { api } from './client';

interface AvatarState {
    avatarUpdatedAt: number | null;
    avatarIcon: AvatarIconChoice | null;
}

/** The avatar shows in `me` and on the public profile, so both caches need the new state. */
function useAvatarMutation<V>(request: (v: V) => Promise<AvatarState>) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: ({ avatarUpdatedAt, avatarIcon }) => {
            qc.setQueryData<UserDto | null>(['me'], (me) =>
                me ? { ...me, avatarUpdatedAt, avatarIcon } : me
            );
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export const useUploadAvatar = () =>
    useAvatarMutation((input: AvatarUploadInput) =>
        api<AvatarState>('/avatar', { method: 'PUT', body: input })
    );

export const useSetAvatarIcon = () =>
    useAvatarMutation((choice: AvatarIconChoice) =>
        api<AvatarState>('/avatar/icon', { method: 'PUT', body: choice })
    );

export const useRemoveAvatar = () =>
    useAvatarMutation((_: void) => api<AvatarState>('/avatar', { method: 'DELETE' }));
