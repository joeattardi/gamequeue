import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddEntryInput,
  EntryDto,
  FacetsDto,
  PatchEntryInput,
  PlatformDto,
  SearchResultDto,
} from "@gamequeue/shared";
import { api } from "./client";

export function useEntries(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: ["entries", qs],
    queryFn: async () => (await api<{ entries: EntryDto[] }>(`/entries${qs ? `?${qs}` : ""}`)).entries,
    placeholderData: keepPreviousData,
  });
}

export const useFacets = () =>
  useQuery({ queryKey: ["facets"], queryFn: () => api<FacetsDto>("/entries/facets") });

export const useEntry = (id: number) =>
  useQuery({ queryKey: ["entry", id], queryFn: async () => (await api<{ entry: EntryDto }>(`/entries/${id}`)).entry });

export const useAllPlatforms = () =>
  useQuery({
    queryKey: ["platforms"],
    queryFn: async () => (await api<{ platforms: PlatformDto[] }>("/igdb/platforms")).platforms,
    staleTime: Infinity,
  });

export function useGameSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: async () => (await api<{ results: SearchResultDto[] }>(`/igdb/search?q=${encodeURIComponent(q)}`)).results,
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function useInvalidateCollection() {
  const qc = useQueryClient();
  return () =>
    Promise.all(["entries", "entry", "facets", "search"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useAddEntry() {
  const invalidate = useInvalidateCollection();
  return useMutation({
    mutationFn: async (input: AddEntryInput) => (await api<{ entry: EntryDto }>("/entries", { method: "POST", body: input })).entry,
    onSuccess: invalidate,
  });
}

export function usePatchEntry(id: number) {
  const invalidate = useInvalidateCollection();
  return useMutation({
    mutationFn: async (patch: PatchEntryInput) => (await api<{ entry: EntryDto }>(`/entries/${id}`, { method: "PATCH", body: patch })).entry,
    onSuccess: invalidate,
  });
}

export function useDeleteEntry(id: number) {
  const invalidate = useInvalidateCollection();
  return useMutation({
    mutationFn: () => api(`/entries/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
