import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, UserDto } from '@gamequeue/shared';
import { api, ApiRequestError } from './client';

const ME = ['me'] as const;

export function useMe() {
    return useQuery({
        queryKey: ME,
        queryFn: async () => {
            try {
                return (await api<{ user: UserDto }>('/auth/me')).user;
            } catch (e) {
                if (e instanceof ApiRequestError && e.status === 401) return null;
                throw e;
            }
        },
        staleTime: 5 * 60_000,
        retry: false
    });
}

/** The signed-in user's first name when they set one, for greetings; undefined otherwise. */
export function useFirstName(): string | undefined {
    return useMe().data?.firstName ?? undefined;
}

export function useAuthConfig() {
    return useQuery({
        queryKey: ['auth-config'],
        queryFn: () => api<{ signupsEnabled: boolean }>('/auth/config'),
        staleTime: 5 * 60_000
    });
}

export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: LoginInput) =>
            api<{ user: UserDto }>('/auth/login', { method: 'POST', body: input }),
        onSuccess: ({ user }) => qc.setQueryData(ME, user)
    });
}

export function useRegister() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: RegisterInput) =>
            api<{ user: UserDto }>('/auth/register', { method: 'POST', body: input }),
        onSuccess: ({ user }) => qc.setQueryData(ME, user)
    });
}

/**
 * Sends the emailed token. A query rather than a mutation: tokens are single-use, and the cache
 * keeps the page from sending it again when it re-mounts (StrictMode, or leaving the wall).
 */
export function useVerifyEmailLink(token: string | null) {
    const qc = useQueryClient();
    return useQuery({
        queryKey: ['verify-email', token],
        enabled: token !== null,
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async () => {
            const res = await api<{ ok: true }>('/auth/verify-email', {
                method: 'POST',
                body: { token }
            });
            // A signed-in, unverified user leaves the wall as soon as `me` says so
            await qc.invalidateQueries({ queryKey: ME });
            return res;
        }
    });
}

export const useResendVerification = () =>
    useMutation({
        mutationFn: () => api<{ ok: true }>('/auth/resend-verification', { method: 'POST' })
    });

/** Fixes a mistyped address while the account is still unverified; the server sends a new link. */
export function useChangeEmail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (email: string) =>
            api<{ user: UserDto }>('/auth/email', { method: 'PUT', body: { email } }),
        onSuccess: ({ user }) => qc.setQueryData(ME, user)
    });
}

/** Re-reads `me` when the tab regains focus, so confirming in another tab or the phone's mail app opens the app. */
export function useRecheckOnFocus() {
    const qc = useQueryClient();
    useEffect(() => {
        const check = () => void qc.invalidateQueries({ queryKey: ME });
        window.addEventListener('focus', check);
        return () => window.removeEventListener('focus', check);
    }, [qc]);
}

export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api('/auth/logout', { method: 'POST' }),
        onSuccess: () => {
            qc.setQueryData(ME, null);
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        }
    });
}
