import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    AccountProfileInput,
    ActivityVisibilityInput,
    ChangePasswordInput,
    DeleteAccountInput,
    SearchIndexingInput,
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

export function useUpdateActivityVisibility() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ActivityVisibilityInput) =>
            api<{ user: UserDto }>('/account/activity', { method: 'PUT', body: input }),
        onSuccess: ({ user }) => {
            qc.setQueryData(['me'], user);
            qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}

export function useUpdateSearchIndexing() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: SearchIndexingInput) =>
            api<{ user: UserDto }>('/account/search-indexing', { method: 'PUT', body: input }),
        onSuccess: ({ user }) => qc.setQueryData(['me'], user)
    });
}

export const useChangePassword = () =>
    useMutation({
        mutationFn: (input: ChangePasswordInput) =>
            api<{ ok: true }>('/account/password', { method: 'PUT', body: input })
    });

/** Deletes the account; on success the session is gone, so the app drops back to the login screen. */
export function useDeleteAccount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: DeleteAccountInput) =>
            api<{ ok: true }>('/account', { method: 'DELETE', body: input }),
        onSuccess: () => {
            qc.setQueryData(['me'], null);
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        }
    });
}
