import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    CreatePostInput,
    JournalDto,
    PatchPostInput,
    PostDto,
    ProfileJournalDto,
    ScreenshotStorageDto,
    Visibility
} from '@gamequeue/shared';
import { api, ApiRequestError } from './client';
import { useInvalidateCollection } from './collection';

const postsKey = (playthroughId: number) => ['posts', playthroughId] as const;

export const usePosts = (playthroughId: number, enabled = true) =>
    useQuery({
        queryKey: postsKey(playthroughId),
        queryFn: async () =>
            (await api<{ posts: PostDto[] }>(`/playthroughs/${playthroughId}/posts`)).posts,
        enabled
    });

/** Posts feed the hours total on the playthrough, so the collection data refreshes with them. */
export function usePostMutations(playthroughId: number) {
    const qc = useQueryClient();
    const invalidateCollection = useInvalidateCollection();
    const refresh = async () => {
        await qc.invalidateQueries({ queryKey: postsKey(playthroughId) });
        await invalidateCollection();
    };
    return {
        create: useMutation({
            mutationFn: async (input: CreatePostInput) =>
                (
                    await api<{ post: PostDto }>(`/playthroughs/${playthroughId}/posts`, {
                        method: 'POST',
                        body: input
                    })
                ).post,
            onSuccess: refresh
        }),
        patch: useMutation({
            mutationFn: async ({ id, ...patch }: PatchPostInput & { id: number }) =>
                (await api<{ post: PostDto }>(`/posts/${id}`, { method: 'PATCH', body: patch }))
                    .post,
            onSuccess: refresh
        }),
        remove: useMutation({
            mutationFn: (id: number) => api(`/posts/${id}`, { method: 'DELETE' }),
            onSuccess: refresh
        }),
        removeImage: useMutation({
            mutationFn: (id: number) => api(`/posts/images/${id}`, { method: 'DELETE' }),
            onSuccess: refresh
        }),
        /** One request per picture, sent as the raw file (see `IMAGE_UPLOAD_PATH` on the server) */
        upload: useMutation({
            mutationFn: async (v: { postId: number; file: File }) => {
                const res = await fetch(`/api/posts/${v.postId}/images`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'content-type': v.file.type },
                    body: v.file
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new ApiRequestError(data.error ?? res.statusText, res.status);
                return data;
            },
            onSuccess: refresh
        })
    };
}

export function useSetVisibility(playthroughId: number) {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: (visibility: Visibility) =>
            api<{ visibility: Visibility; shareSlug: string | null }>(
                `/playthroughs/${playthroughId}/visibility`,
                { method: 'PUT', body: { visibility } }
            ),
        onSuccess: invalidate
    });
}

export const useJournal = (slug: string) =>
    useQuery({
        queryKey: ['journal', slug],
        queryFn: async () => (await api<{ journal: JournalDto }>(`/journals/${slug}`)).journal,
        retry: false
    });

export const useProfileJournals = (username: string) =>
    useQuery({
        queryKey: ['profile', username, 'journals'],
        queryFn: async () =>
            (await api<{ journals: ProfileJournalDto[] }>(`/profiles/${username}/journals`))
                .journals,
        retry: false
    });

export const useScreenshotStorage = () =>
    useQuery({
        queryKey: ['admin', 'screenshots'],
        queryFn: () => api<ScreenshotStorageDto>('/admin/screenshots'),
        refetchOnWindowFocus: true
    });

export function useSetScreenshotCap() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (capBytes: number) =>
            api<ScreenshotStorageDto>('/admin/screenshots/cap', {
                method: 'PUT',
                body: { capBytes }
            }),
        onSuccess: (data) => qc.setQueryData(['admin', 'screenshots'], data)
    });
}
