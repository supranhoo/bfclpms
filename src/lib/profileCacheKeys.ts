/**
 * Centralized list of React Query keys whose data depends on profile rows
 * (employee_code, full_name, designation, department_id, company_id,
 * reporting_manager_id, is_active, etc.).
 *
 * Whenever a profile is created, edited or deleted (whether through the
 * User Management UI, a bulk import, or any future code path), call
 * `invalidateProfileCaches(queryClient)` to force these caches to refetch.
 *
 * Why: hooks like useCompanyFilter (10 min staleTime), useProfilesWithHierarchy
 * and useMonthlyTrend (5 min staleTime) cache employee → company / hierarchy
 * maps. Without explicit invalidation an admin who renames an employee or
 * changes their employee_code may not see the update reflected in pickers,
 * filter cascades or report grids until the staleTime elapses.
 *
 * Codified in POLICY.md §95 (Profile Cache Invalidation Contract).
 */
import type { QueryClient } from '@tanstack/react-query';

export const PROFILE_DEPENDENT_QUERY_KEYS: ReadonlyArray<readonly unknown[]> = [
  ['profiles'],
  ['profiles-hierarchy'],
  ['employee-company-map'],
  ['companies-for-filter'],
  ['distinct-designations'],
  ['distinct-grades'],
  ['managers-list'],
  ['monthly-trend'],
  ['kpi-employee-matrix'],
  ['admin-reports'],
  ['employee-filter-options'],
] as const;

export function invalidateProfileCaches(queryClient: QueryClient): void {
  for (const key of PROFILE_DEPENDENT_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: key as unknown[] });
  }
}
