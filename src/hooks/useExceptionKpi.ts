/**
 * ADR-317 — React data layer for exception KPIs.
 *
 * Queries stay period-stamped so a stale roster from another month can never
 * be released (the ADR-252c range-stamp lesson). Every mutation invalidates the
 * ledger rows, the roster summary and the release state together.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchExceptionSummary, fetchLastReleaseRun, releaseExceptionPeriod,
  seedScopeRows, setExceptionConfig,
} from '@/services/orgKpiDataset/exceptionKpiService';

const KEY = 'exception-kpi';

export function useExceptionSummary(args: {
  datasetId?: string | null;
  reviewYear: number;
  reviewPeriod: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [KEY, 'summary', args.datasetId, args.reviewYear, args.reviewPeriod],
    queryFn: () => fetchExceptionSummary({
      datasetId: args.datasetId as string,
      reviewYear: args.reviewYear,
      reviewPeriod: args.reviewPeriod,
    }),
    enabled: !!args.datasetId && (args.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useExceptionReleaseState(args: {
  datasetId?: string | null;
  reviewYear: number;
  reviewPeriod: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [KEY, 'release-state', args.datasetId, args.reviewYear, args.reviewPeriod],
    queryFn: () => fetchLastReleaseRun({
      datasetId: args.datasetId as string,
      reviewYear: args.reviewYear,
      reviewPeriod: args.reviewPeriod,
    }),
    enabled: !!args.datasetId && (args.enabled ?? true),
    staleTime: 15_000,
  });
}

function useInvalidateExceptionViews() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: ['org-kpi-dataset'] });
    void qc.invalidateQueries({ queryKey: ['bu-console'] });
  };
}

export function useSetExceptionConfig() {
  const invalidate = useInvalidateExceptionViews();
  return useMutation({
    mutationFn: setExceptionConfig,
    onSuccess: invalidate,
  });
}

export function useSeedScopeRows() {
  const invalidate = useInvalidateExceptionViews();
  return useMutation({
    mutationFn: seedScopeRows,
    onSuccess: (_res, vars) => { if (!vars.dryRun) invalidate(); },
  });
}

export function useReleaseExceptionPeriod() {
  const invalidate = useInvalidateExceptionViews();
  return useMutation({
    mutationFn: releaseExceptionPeriod,
    onSuccess: (_res, vars) => { if (!vars.dryRun) invalidate(); },
  });
}
