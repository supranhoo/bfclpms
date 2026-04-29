import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * useManualQuery — Safety module SSOT for filters-first / click-to-load /
 * paginated list screens (POLICY §113 / ADR-050).
 *
 * Contract:
 * - No fetch fires until `submit(filters)` is called.
 * - Cache key = base queryKey + submitted filters + page + pageSize.
 * - `setPage` / `setPageSize` re-issue the query for the *last submitted*
 *   filters only (typing in the filter bar does not refetch).
 * - Changing pageSize resets to page 1.
 * - The `fetcher` receives `{ filters, range: [from, to], page, pageSize }`
 *   and must return `{ rows, total }`. It is responsible for applying
 *   `.range(from, to)` and `count: 'exact'` against the SDK.
 */

export const SAFETY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const SAFETY_DEFAULT_PAGE_SIZE = 25;

export interface ManualQueryFetcherArgs<F> {
  filters: F;
  range: [number, number];
  page: number;
  pageSize: number;
}

export interface ManualQueryResult<T> {
  rows: T[];
  total: number;
}

export interface UseManualQueryOptions {
  /** Initial page size (defaults to 25). */
  pageSize?: number;
  /** Cache lifetime in ms for already-submitted queries. */
  staleTime?: number;
}

export function useManualQuery<T, F>(
  baseKey: QueryKey,
  fetcher: (args: ManualQueryFetcherArgs<F>) => Promise<ManualQueryResult<T>>,
  options: UseManualQueryOptions = {},
) {
  const initialSize = options.pageSize ?? SAFETY_DEFAULT_PAGE_SIZE;
  const [submittedFilters, setSubmittedFilters] = useState<F | null>(null);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialSize);
  const lastSubmittedRef = useRef<F | null>(null);
  const qc = useQueryClient();

  const enabled = submittedFilters !== null;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const queryKey: QueryKey = useMemo(
    () => [...baseKey, submittedFilters, page, pageSize],
    [baseKey, submittedFilters, page, pageSize],
  );

  const query = useQuery({
    queryKey,
    enabled,
    staleTime: options.staleTime ?? 30_000,
    queryFn: () =>
      fetcher({
        filters: submittedFilters as F,
        range: [from, to],
        page,
        pageSize,
      }),
  });

  const submit = useCallback((filters: F) => {
    lastSubmittedRef.current = filters;
    setPageState(1);
    setSubmittedFilters(filters);
  }, []);

  const reset = useCallback(() => {
    lastSubmittedRef.current = null;
    setSubmittedFilters(null);
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState((prev) => (Number.isFinite(next) && next >= 1 ? Math.floor(next) : prev));
  }, []);

  const setPageSize = useCallback((next: number) => {
    if (!Number.isFinite(next) || next < 1) return;
    setPageSizeState(Math.floor(next));
    setPageState(1); // changing pageSize resets to first page
  }, []);

  /**
   * Re-runs the *last submitted* query (e.g. after a mutation invalidates
   * the cache). Filters are NOT changed; this is the only sanctioned way
   * for mutations to refresh a Safety list.
   */
  const refetchLast = useCallback(() => {
    if (lastSubmittedRef.current === null) return;
    qc.invalidateQueries({ queryKey: baseKey });
  }, [qc, baseKey]);

  const total = query.data?.total ?? 0;
  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    // state
    hasSubmitted: enabled,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    error: query.error,
    rows,
    total,
    page,
    pageSize,
    totalPages,
    // actions
    submit,
    reset,
    setPage,
    setPageSize,
    refetchLast,
  };
}
