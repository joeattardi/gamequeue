import { useMutation, useQuery } from '@tanstack/react-query';
import type { AddWishlistItemInput, PatchWishlistItemInput, WishlistDto } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';

export const useWishlist = () =>
    useQuery({
        queryKey: ['wishlist'],
        queryFn: async () => (await api<{ wishlist: WishlistDto }>('/wishlist')).wishlist
    });

export function useAddToWishlist() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (input: AddWishlistItemInput) =>
            api('/wishlist/items', { method: 'POST', body: input }),
        onSuccess: invalidate
    });
}

export function usePatchWishlistItem() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (v: { igdbId: number; patch: PatchWishlistItemInput }) =>
            api(`/wishlist/items/${v.igdbId}`, { method: 'PATCH', body: v.patch }),
        onSuccess: invalidate
    });
}

export function useRemoveFromWishlist() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (igdbId: number) => api(`/wishlist/items/${igdbId}`, { method: 'DELETE' }),
        onSuccess: invalidate
    });
}

export function useReorderWishlist() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (igdbIds: number[]) =>
            api('/wishlist/order', { method: 'PUT', body: { igdbIds } }),
        // Refetch either way so the UI snaps back to the server's order if the save failed
        onSettled: invalidate
    });
}
