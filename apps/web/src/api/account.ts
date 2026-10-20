import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountProfileInput, UserDto } from '@gamequeue/shared';
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
