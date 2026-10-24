import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    CreateGridInput,
    GridDto,
    GridSummaryDto,
    PatchGridInput,
    PublicGridDto,
    SetGridCellInput
} from '@gamequeue/shared';
import { api } from './client';

export const useGrids = () =>
    useQuery({
        queryKey: ['grids'],
        queryFn: async () => (await api<{ grids: GridSummaryDto[] }>('/grids')).grids
    });

export const useGrid = (id: number) =>
    useQuery({
        queryKey: ['grid', id],
        queryFn: async () => (await api<{ grid: GridDto }>(`/grids/${id}`)).grid,
        retry: false
    });

/** Anyone's grid; no login needed. */
export const usePublicGrid = (username: string, id: number) =>
    useQuery({
        queryKey: ['profile', username, 'grid', id],
        queryFn: async () =>
            (await api<{ grid: PublicGridDto }>(`/profiles/${username}/grids/${id}`)).grid,
        retry: false
    });

/** After a change: keep the grid's own cache current and refresh the tiles that show it. */
function useAfterChange() {
    const qc = useQueryClient();
    return (grid: GridDto) => {
        qc.setQueryData(['grid', grid.id], grid);
        void qc.invalidateQueries({ queryKey: ['grids'] });
        void qc.invalidateQueries({ queryKey: ['profile'] });
    };
}

export function useCreateGrid() {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (input: Partial<CreateGridInput> & { title: string }) =>
            (await api<{ grid: GridDto }>('/grids', { method: 'POST', body: input })).grid,
        onSuccess: after
    });
}

export function usePatchGrid(id: number) {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (patch: PatchGridInput) =>
            (await api<{ grid: GridDto }>(`/grids/${id}`, { method: 'PATCH', body: patch })).grid,
        onSuccess: after
    });
}

export function useSetGridCell(id: number) {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (v: { position: number; cell: SetGridCellInput }) =>
            (
                await api<{ grid: GridDto }>(`/grids/${id}/cells/${v.position}`, {
                    method: 'PUT',
                    body: v.cell
                })
            ).grid,
        onSuccess: after
    });
}

export function useSwapGridCells(id: number) {
    const after = useAfterChange();
    return useMutation({
        mutationFn: async (v: { a: number; b: number }) =>
            (await api<{ grid: GridDto }>(`/grids/${id}/swap`, { method: 'PUT', body: v })).grid,
        onSuccess: after
    });
}

export function useDeleteGrid() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api(`/grids/${id}`, { method: 'DELETE' }),
        onSuccess: (_, id) => {
            qc.removeQueries({ queryKey: ['grid', id] });
            void qc.invalidateQueries({ queryKey: ['grids'] });
            void qc.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}
