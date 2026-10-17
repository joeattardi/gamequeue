import { useMutation } from '@tanstack/react-query';
import type { ImportReport } from '@gamequeue/shared';
import { api } from './client';
import { useInvalidateCollection } from './collection';

/** Sends an export file to the server. Without `commit` it's a preview that changes nothing. */
export function useImport() {
    const invalidate = useInvalidateCollection();
    return useMutation({
        mutationFn: async (v: { file: unknown; commit: boolean }) =>
            (
                await api<{ report: ImportReport }>(
                    `/data/import${v.commit ? '?commit=true' : ''}`,
                    {
                        method: 'POST',
                        body: v.file
                    }
                )
            ).report,
        onSuccess: (_report, v) => (v.commit ? invalidate() : undefined)
    });
}
