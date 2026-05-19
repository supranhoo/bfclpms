## Issue

On `/dashboard?view=hr_pms` the **Manager** filter popover renders only the "— None —" item — no actual manager names appear, even though the DB has 2,516 of 2,538 active employees with a `reporting_manager_id`. Same picker works correctly elsewhere after a hard refresh, which is the classic symptom of the cold-mount auth race documented in `mem://architecture/auth-readiness-query-gate` and ADR-052 / POLICY §96.

## Root cause

`src/hooks/useEmployeeFilterOptions.ts` issues three React Query reads against `profiles` (managers, designations, grades) but **never gates `enabled` on `isReady && !!user`** from `useAuth()`. On a cold mount the queries fire before Supabase rehydrates the session from localStorage; PostgREST then evaluates the `profiles` SELECT policy with no `auth.uid()` and returns 0 rows. React Query caches the empty array for `staleTime`, so the Manager dropdown stays empty until the user hard-refreshes or another invalidation event fires.

The other dashboard counters (e.g. "2,472 eligible of 2,538") read from a different hook that already participates in the auth-ready invalidation list, which is why those numbers look correct while the Manager picker is empty.

Confirmed:
- `useEmployeeFilterOptions` has no `useAuth()` import and no `enabled` gate.
- Query keys (`managers-list`, `distinct-designations`, `distinct-grades`) are not in `AuthContext`'s not-ready → ready invalidation list.
- DB check: 2,516 active profiles carry a `reporting_manager_id`, so the picker should never be empty for an admin.

## Fix

Apply the standard Auth-Readiness Query Gate pattern to all three queries in `useEmployeeFilterOptions`, and add the three keys to the `AuthContext` invalidation list as defence-in-depth.

### 1. `src/hooks/useEmployeeFilterOptions.ts`
- Import `useAuth` and read `const { isReady, user } = useAuth();`.
- Add `enabled: isReady && !!user` to each `useQuery` (preserving the existing `enabled: enabledGrades` for `grades` by ANDing).
- Include `user?.id` in each query key so the cache is per-user (consistent with the policy).

### 2. `src/contexts/AuthContext.tsx`
- In the not-ready → ready transition invalidation block, add: `managers-list`, `distinct-designations`, `distinct-grades`. Match the predicate style already used for `org-level-kpis*` etc.

### 3. Regression test
- `src/test/employeeFilterOptionsAuthGate.test.tsx` — mount `useEmployeeFilterOptions` with `isReady=false`, assert no Supabase call; flip to `isReady=true` with a user, assert the paged fetch fires and managers populate.

## Risk & Impact

- **Data Impact:** None. Read-only hook change. No schema, RLS, or migration.
- **Workflow Impact:** None. Same data, just gated on auth bootstrap.
- **UI/UX:** Manager / Designation / Grade dropdowns may show a brief "loading" state on first paint instead of incorrectly empty. Acceptable and consistent with other gated hooks.
- **Regression risk:** Low. Pattern is already used across the codebase (see memory entry). Tests cover the gate.
- **Mitigation:** Keep `placeholderData`/skeletons unchanged; add the regression test above; verify HR PMS, Team Reviews, Skip Mgr Review, Manager Review still populate the Manager dropdown after the change.

## Out of scope

- No change to RLS, the `profiles` query selection, or `OrgFilterCombobox`.
- No change to other Manager pickers (e.g. `useKpiFilters.useProfilesWithHierarchy`) — they should be audited separately if symptoms appear there.
