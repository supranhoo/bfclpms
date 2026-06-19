import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/annualReview/selfReviewLibrary';
import type { SelfReviewLibraryEntry } from '@/types/annualReview';

const KEY = ['self-review-library'] as const;

export function useSelfReviewLibrary(params: svc.ListLibraryParams = {}) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: () => svc.listLibrary(params),
    staleTime: 60_000,
  });
}

export function useBundleFields(bundleId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'bundle', bundleId],
    queryFn: () => svc.getBundleFields(bundleId!),
    enabled: !!bundleId,
  });
}

export function useUpsertLibraryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SelfReviewLibraryEntry> & { kind: 'field' | 'bundle'; key: string; label_en: string }) => {
      if (input.id) return svc.updateEntry(input.id, input);
      return svc.createEntry(input);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useDeleteLibraryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deleteEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useDeactivateLibraryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deactivateEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}