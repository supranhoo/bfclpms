import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  KPI_LIST_STALE_MS,
  KPI_LIST_GC_MS,
  REVIEW_SUBMISSIONS_STALE_MS,
  REVIEW_SUBMISSIONS_GC_MS,
  FILTER_OPTIONS_STALE_MS,
  FILTER_OPTIONS_GC_MS,
  PERF_REFETCH_ON_FOCUS,
} from '@/lib/perfCacheDefaults';

/**
 * POLICY §PERF-CACHE-TTL-DEFAULTS — v2.66.58.
 *
 * Pins the cache-TTL floors that drive the hot reviewer query keys:
 *   - ['all-kpis'] / ['kpis-by-period']  → KPI_LIST_*
 *   - ['review-submissions']             → REVIEW_SUBMISSIONS_*
 *   - ['distinct-designations'/'distinct-grades'/'managers-list'/
 *      'functional-managers-list']       → FILTER_OPTIONS_*
 *
 * Lower values reintroduce the call-volume regression measured in
 * pg_stat_statements on 27-Jun-2026 (hotspots #1, #2, #4, #6, #7).
 * Invalidation paths (useRealtimeKpiSync, invalidateProfileCaches)
 * already keep these caches fresh on real mutations.
 */
describe('perfCacheDefaults — floors', () => {
  it('KPI list cache ≥ 10 min stale / 30 min gc', () => {
    expect(KPI_LIST_STALE_MS).toBeGreaterThanOrEqual(10 * 60_000);
    expect(KPI_LIST_GC_MS).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it('review_submissions cache ≥ 2 min stale / 10 min gc', () => {
    expect(REVIEW_SUBMISSIONS_STALE_MS).toBeGreaterThanOrEqual(2 * 60_000);
    expect(REVIEW_SUBMISSIONS_GC_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('filter-options cache ≥ 10 min stale / 30 min gc', () => {
    expect(FILTER_OPTIONS_STALE_MS).toBeGreaterThanOrEqual(10 * 60_000);
    expect(FILTER_OPTIONS_GC_MS).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it('focus-refetch is OFF for hot reviewer hooks', () => {
    expect(PERF_REFETCH_ON_FOCUS).toBe(false);
  });
});

describe('perfCacheDefaults — call-site wiring', () => {
  const root = process.cwd();

  it('useKpis.ts imports the perf cache defaults', () => {
    const src = readFileSync(join(root, 'src/hooks/useKpis.ts'), 'utf-8');
    expect(src).toMatch(/from\s+['"]@\/lib\/perfCacheDefaults['"]/);
    expect(src).toMatch(/staleTime:\s*KPI_LIST_STALE_MS/);
    expect(src).toMatch(/staleTime:\s*REVIEW_SUBMISSIONS_STALE_MS/);
    expect(src).toMatch(/refetchOnWindowFocus:\s*PERF_REFETCH_ON_FOCUS/);
  });

  it('useEmployeeFilterOptions.ts imports the perf cache defaults', () => {
    const src = readFileSync(
      join(root, 'src/hooks/useEmployeeFilterOptions.ts'),
      'utf-8',
    );
    expect(src).toMatch(/from\s+['"]@\/lib\/perfCacheDefaults['"]/);
    expect(src).toMatch(/staleTime:\s*FILTER_OPTIONS_STALE_MS/);
    expect(src).toMatch(/refetchOnWindowFocus:\s*PERF_REFETCH_ON_FOCUS/);
  });
});