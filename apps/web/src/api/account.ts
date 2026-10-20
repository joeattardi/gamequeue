import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    AccountProfileInput,
    ChangePasswordInput,
    SocialLinksInput,
    UserDto
} from '@gamequeue/shared';
import { api } from './client';

export function useUpdateAccount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: AccountProfileInput) =>
            api<{ user: UserDto }>('/account', { method: 'PATCH', body: input }),
        onSuccess: ({ user }) => {
            qc.setQueryData(['me'], user);
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export function useUpdateSocialLinks() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: SocialLinksInput) =>
            api<{ user: UserDto }>('/account/social', { method: 'PUT', body: input }),
        onSuccess: ({ user }) => {
            qc.setQueryData(['me'], user);
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export const useChangePassword = () =>
    useMutation({
        mutationFn: (input: ChangePasswordInput) =>
            api<{ ok: true }>('/account/password', { method: 'PUT', body: input })
    });
