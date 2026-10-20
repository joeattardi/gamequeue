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
