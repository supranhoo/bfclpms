import { useQuery } from '@tanstack/react-query';
import {
  fetchAssistedSubmissions, fetchAssistedSummary, ASSISTED_PAGE_SIZE,
  type AssistedFilters, type AssistedPage, type AssistedSummary,
} from '@/services/annualReview/assistedSubmissions';

/** Stable, filter-complete query key — every filter must participate (ADR-203). */
export function assistedQueryKey(filters: AssistedFilters, page: number) {
  return [
    'annual-review-assisted',
    filters.cycleId ?? null,
    filters.from ?? null,
    filters.to ?? null,
    filters.proxyUserId ?? null,
    filters.departmentId ?? null,
    filters.businessUnitId ?? null,
    filters.evidence ?? 'all',
    (filters.search ?? '').trim(),
    page,
  ] as const;
}

export function useAssistedSubmissions(filters: AssistedFilters, page: number) {
  return useQuery<AssistedPage>({
    queryKey: assistedQueryKey(filters, page),
    queryFn: () => fetchAssistedSubmissions(filters, page, ASSISTED_PAGE_SIZE),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useAssistedSummary(cycleId?: string | null) {
  return useQuery<AssistedSummary>({
    queryKey: ['annual-review-assisted-summary', cycleId ?? null],
    queryFn: () => fetchAssistedSummary(cycleId),
    staleTime: 60_000,
  });
}
