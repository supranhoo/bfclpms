/** ADR-226 — React Query bindings for annual review recommendation tracking. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  bulkDecideRecommendations,
  decideRecommendation,
  fetchInstanceRecommendations,
  fetchRecommendationQueue,
  fetchRecommendationTypes,
  saveRecommendation,
  type RecommendationQueueFilters,
  type SaveRecommendationInput,
  type RecommendationStatus,
} from '@/services/annualReview/recommendations';

export const recommendationKeys = {
  types: ['ar-recommendation-types'] as const,
  instance: (id: string) => ['ar-recommendations', 'instance', id] as const,
  queue: (f: RecommendationQueueFilters) => ['ar-recommendations', 'queue', f] as const,
};

export function useRecommendationTypes() {
  return useQuery({
    queryKey: recommendationKeys.types,
    queryFn: fetchRecommendationTypes,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInstanceRecommendations(instanceId?: string) {
  return useQuery({
    queryKey: recommendationKeys.instance(instanceId ?? 'none'),
    queryFn: () => fetchInstanceRecommendations(instanceId!),
    enabled: !!instanceId,
  });
}

export function useSaveRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveRecommendationInput) => saveRecommendation(input),
    onSuccess: (_id, input) => {
      qc.invalidateQueries({ queryKey: recommendationKeys.instance(input.instanceId) });
      qc.invalidateQueries({ queryKey: ['ar-recommendations', 'queue'] });
      toast.success('Recommendation saved');
    },
    onError: (e: unknown) =>
      toast.error(`Could not save recommendation: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useRecommendationQueue(filters: RecommendationQueueFilters, enabled = true) {
  return useQuery({
    queryKey: recommendationKeys.queue(filters),
    queryFn: () => fetchRecommendationQueue(filters),
    enabled: enabled && !!filters.cycleId,
    placeholderData: (prev) => prev,
  });
}

export function useDecideRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      status: RecommendationStatus;
      reason: string;
      approvedAmountKind?: 'absolute' | 'percent' | null;
      approvedAmountValue?: number | null;
    }) => decideRecommendation(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-recommendations'] });
      toast.success('Decision recorded');
    },
    onError: (e: unknown) =>
      toast.error(`Could not record decision: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}

export function useBulkDecideRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ids: string[]; status: RecommendationStatus; reason: string }) =>
      bulkDecideRecommendations(args),
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['ar-recommendations'] });
      toast.success(`${count} recommendation(s) updated`);
    },
    onError: (e: unknown) =>
      toast.error(`Bulk decision failed: ${(e as Error)?.message ?? 'unknown error'}`),
  });
}
