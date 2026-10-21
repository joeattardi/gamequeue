import { useMutation, useQuery } from '@tanstack/react-query';
import type {
    AddWishlistItemInput,
    PatchWishlistItemInput,
    WishlistDto,
    WishlistItemDto
} from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';
import { usePagedQuery, withPage } from './paging';

/** The wishlist a page at a time; `total` is the whole wishlist. */
export const useWishlist = () =>
    usePagedQuery({
        key: ['wishlist'],
        load: async (offset, limit) =>
            (await api<{ wishlist: WishlistDto }>(withPage('/wishlist', offset, limit))).wishlist,
        read: (w) => ({ items: w.items, total: w.total })
    });

/** How many games are on the wishlist, without loading them (first page of one). */
export const useWishlistCount = () =>
    useQuery({
        queryKey: ['wishlist', 'count'],
        queryFn: async () =>
            (await api<{ wishlist: WishlistDto }>(withPage('/wishlist', 0, 1))).wishlist.total
    });

/** Wishlisted games releasing on an exact day in the next `days` days (the home page). */
export const useReleasingSoon = (days: number, today: string) =>
    useQuery({
        queryKey: ['wishlist', 'releasing-soon', days, today],
        queryFn: async () =>
            (
                await api<{ items: WishlistItemDto[] }>(
                    `/wishlist/releasing-soon?days=${days}&today=${today}`
                )
            ).items
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

export function useMoveInWishlist() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (v: { igdbId: number; toIndex: number }) =>
            api('/wishlist/move', { method: 'PUT', body: v }),
        // Refetch either way so the UI snaps back to the server's order if the save failed
        onSettled: invalidate
    });
}
