/** ADR-226 Phase 2 — React Query bindings for legacy recommendation import. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  deleteRecommendationKeyword,
  fetchImportRuns,
  fetchRecommendationKeywords,
  reclassifyRecommendation,
  rollbackRecommendationImport,
  runLegacyRecommendationImport,
  upsertRecommendationKeyword,
  type RecommendationKeyword,
} from '@/services/annualReview/recommendationImport';

export function useRecommendationKeywords() {
  return useQuery({
    queryKey: ['ar-recommendation-keywords'],
    queryFn: fetchRecommendationKeywords,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveRecommendationKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<RecommendationKeyword> & { pattern: string; type_key: string }) =>
      upsertRecommendationKeyword(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-recommendation-keywords'] });
      toast.success('Keyword rule saved');
    },
    onError: (e: unknown) =>
      toast.error(`Could not save rule: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useDeleteRecommendationKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecommendationKeyword(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-recommendation-keywords'] });
      toast.success('Keyword rule removed');
    },
    onError: (e: unknown) =>
      toast.error(`Could not remove rule: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useImportRuns(cycleId?: string) {
  return useQuery({
    queryKey: ['ar-recommendation-import-runs', cycleId],
    queryFn: () => fetchImportRuns(cycleId!),
    enabled: !!cycleId,
  });
}

export function useRunLegacyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { cycleId: string; dryRun: boolean; limit?: number }) =>
      runLegacyRecommendationImport(args),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ar-recommendation-import-runs'] });
      if (!res.dry_run) {
        qc.invalidateQueries({ queryKey: ['ar-recommendations'] });
        toast.success(
          `Imported ${res.created} new and refreshed ${res.updated} recommendation(s)`,
        );
      }
    },
    onError: (e: unknown) =>
      toast.error(`Import failed: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useRollbackImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => rollbackRecommendationImport(runId),
    onSuccess: (deleted) => {
      qc.invalidateQueries({ queryKey: ['ar-recommendation-import-runs'] });
      qc.invalidateQueries({ queryKey: ['ar-recommendations'] });
      toast.success(`${deleted} imported recommendation(s) removed`);
    },
    onError: (e: unknown) =>
      toast.error(`Rollback failed: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useReclassifyRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      typeKeys: string[];
      amountKind?: 'absolute' | 'percent' | null;
      amountValue?: number | null;
    }) => reclassifyRecommendation(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-recommendations'] });
      toast.success('Recommendation reclassified');
    },
    onError: (e: unknown) =>
      toast.error(`Could not reclassify: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}