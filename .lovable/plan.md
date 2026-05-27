## Problem

Opening the new "Copy KPI to Other Employees" collapsible in `AdminKpiEditorForm` hangs on "Loading employees…" for several seconds. Root cause:

1. The fetch lives in a local `useEffect` + `useState` (lines 194–221 of `AdminKpiEditorForm.tsx`). It runs **every time** the collapsible is opened on a freshly-mounted editor — no cache, no dedupe.
2. `CopyKrasDialog.tsx` already fetches the **same** 2,533-row paged roster under its own React Query key `['copy-kras-employees']` (lines 87–108). The two callers don't share a cache.
3. `fetchAllPaged` makes 3 sequential round-trips (1000+1000+~533). With a cold cache and slow connection that's 1.5–3s on top of the editor open.

## Risk & Impact Report

- **Data**: None. Same query, same projection, same `is_active=true` filter. POLICY §94 paging preserved.
- **Workflow**: None. UX only.
- **UI/UX**: First open in a session still shows the spinner once; subsequent opens (and opening `CopyKrasDialog`) are instant.
- **Regression**: Low. Both callers continue to receive `EmployeeOption[]`. Shape unchanged.
- **Scalability**: Improves — one cached fetch per 5-minute window across the whole app instead of one per dialog open.
- **Mitigation**: Keep `EmployeeCombobox` data contract intact; reuse the existing paged query pattern verbatim.

## Plan

1. **Create `src/hooks/useActiveEmployeesForCopy.ts`** — React Query hook that paginates `profiles` (same select as today) and returns `EmployeeOption[]`. Settings:
   - `queryKey: ['active-employees-for-copy']`
   - `staleTime: 5 * 60_000` (5 min)
   - `gcTime: 10 * 60_000`
   - `enabled` flag from caller so we only fetch when a copy UI is opened
2. **Refactor `AdminKpiEditorForm.tsx`**
   - Remove `employeesForCopy`, `loadingEmployees` state and the `useEffect` that fetches them (lines 92, 93, 194–221).
   - Call `useActiveEmployeesForCopy({ enabled: copyToEmployeesOpen })`; derive `loadingEmployees` from `isLoading`.
   - Feed `data ?? []` into the existing `EmployeeCombobox` and duplicate-counts logic.
3. **Refactor `CopyKrasDialog.tsx`**
   - Replace the inline `useQuery(['copy-kras-employees'], …)` (lines 87–108) with the shared hook (`enabled: isOpen`). Same `Employee` shape — adapt the destructure if needed.
4. **Test** — add `src/test/useActiveEmployeesForCopy.test.tsx`: mocks `supabase.from('profiles')` to return >1000 rows across two pages, asserts the hook returns the full mapped roster and is cached (second call doesn't re-fetch within stale window).
5. **Docs** — append a one-line note to `DOCUMENTATION.md` Version History: "Shared cached roster fetch for Copy-KPI tools (5-min staleTime)." No POLICY change (§94 paging unchanged).

## Out of scope

- Server-side employee search RPC (would require schema/RPC work; defer unless 5-min cache proves insufficient).
- Changing the projection on `profiles` or adding new filters.
- Touching `OrgKpiAddEmployeeDialog` (different shape with `department_id`; can migrate later).

## Rollback

Pure additive hook + two call-site swaps. Revert the two files and delete the hook + test.
