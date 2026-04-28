# BUG-043 — KPI Mapping Matrix shows only 996 employees

## Root Cause
`src/hooks/useAdminReports.ts` (line ~134, `useKpiMappingMatrix`) calls `supabase.from('profiles').select(...).order('full_name')` **without `.range()` or `fetchAllPaged`**. PostgREST silently caps unranged reads at 1000 rows. With ~2,533 active employees in the roster, the matrix only ever sees the first 1000 alphabetical profiles (~996 active after filtering), regardless of filters or pagination UI.

The sibling KPI fetch in the same hook is correctly batched — only profiles was missed. This is the **exact** rule codified in `POLICY.md §94` and `mem://architecture/profiles-query-policy`, which lists every picker/list `profiles.select(...)` site that must use `fetchAllPaged`. The matrix hook was overlooked when §94 was rolled out.

## Risk & Impact Report
- **Data Impact**: None to schema/RLS. Read-only query. Fix returns the *correct* full roster instead of a silently-truncated one.
- **Workflow Impact**: Coverage % and "mapped employees" KPI in the matrix become accurate; previously under-reported because denominator was capped at ~996.
- **UI/UX**: No visual change. Pagination already exists and will now span the real dataset.
- **Regression Risk**: Low. `fetchAllPaged` is the project-standard helper used by every other picker. One extra page request (~3 pages for ~2.5k rows) — negligible.
- **Mitigation**: Add a regression test asserting the hook uses `fetchAllPaged` for profiles, and update §94's enumerated list to include this hook.

## Fix

**`src/hooks/useAdminReports.ts`** — wrap the profiles query in `fetchAllPaged`:

```ts
import { fetchAllPaged } from '@/lib/fetchAll';

// inside useQuery({ queryKey: ['kpi-mapping-profiles'], queryFn: ... })
const data = await fetchAllPaged<any>((from, to) =>
  supabase
    .from('profiles')
    .select(`
      id, full_name, employee_code, pms_grade, designation, department_id, is_active,
      departments (id, name, business_units (id, name, divisions (id, name)))
    `)
    .order('full_name')
    .range(from, to)
);
return data;
```

(Active-only filtering stays in the in-memory step where it already lives — `p.is_active !== false` — to keep coverage math consistent with how counts were computed before.)

## Audit for Sibling Leaks
While here, grep `src/hooks/useKpiEmployeeMatrix.ts` and other admin/report hooks for the same anti-pattern. The KPI Employee Matrix hook joins profiles via the `kpis` foreign-key embed (not a separate `from('profiles')` list), so it's exempt — but I'll verify no other unranged `from('profiles').select(...)` list queries exist in admin/report hooks and patch any I find in the same change.

## Regression Test
Add **BUG-043** to `src/test/bugBountyFixes.test.ts`:
- Assert `useAdminReports.ts` source contains `fetchAllPaged` in proximity to `from('profiles')`.
- Assert no bare unranged `.from('profiles').select(...).order(...)` chain remains in the file (string check).

## Documentation & Memory
- `POLICY.md §94`: append `useAdminReports.ts → useKpiMappingMatrix` to the enumerated list of paged sites.
- `DOCUMENTATION.md`: bump version (v2.66.7.45), entry under "Bug Fixes — KPI Mapping Matrix coverage truncation".
- `mem/architecture/profiles-query-policy`: add hook to the codified list.
- `mem/features/admin/kpi-mapping-matrix-dashboard`: note the paging requirement.

## Files to Edit
- `src/hooks/useAdminReports.ts`
- `src/test/bugBountyFixes.test.ts`
- `POLICY.md`
- `DOCUMENTATION.md`
- `mem/architecture/profiles-query-policy`
- `mem/features/admin/kpi-mapping-matrix-dashboard`

Approve to implement.
