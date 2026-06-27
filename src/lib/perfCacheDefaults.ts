/**
 * v2.66.58 — Centralized cache TTLs for the hot reviewer-path hooks.
 * POLICY §PERF-CACHE-TTL-DEFAULTS.
 *
 * pg_stat_statements (27-Jun-2026) showed the top 8 query patterns dominated
 * by REPEAT calls (44k–142k each) for data that changes only on explicit
 * user actions already wired through `useRealtimeKpiSync` (1.5s debounced
 * cache invalidation) and `invalidateProfileCaches`. Bumping staleTime on
 * those query keys cuts call volume without losing freshness — server CPU
 * and client CPU both drop because round-trips disappear.
 *
 * Rollback: revert this file's exported numbers to the previous defaults.
 * Per-hook overrides remain in their own modules; this is the floor.
 */

/** Bulk KPI lists (`['all-kpis']`, `['kpis-by-period']`). */
export const KPI_LIST_STALE_MS = 10 * 60_000;
export const KPI_LIST_GC_MS = 30 * 60_000;

/** Bulk review_submissions reads keyed by kpiIds. */
export const REVIEW_SUBMISSIONS_STALE_MS = 2 * 60_000;
export const REVIEW_SUBMISSIONS_GC_MS = 10 * 60_000;

/** Filter pickers (designations, grades, managers, functional managers). */
export const FILTER_OPTIONS_STALE_MS = 10 * 60_000;
export const FILTER_OPTIONS_GC_MS = 30 * 60_000;

/**
 * Window-focus refetch is OFF for these hooks: a Postgres-side change is
 * already covered by `useRealtimeKpiSync` / `invalidateProfileCaches`, so
 * focus refetches only re-bill the same data.
 */
export const PERF_REFETCH_ON_FOCUS = false;