

## Plan — Fix "Only 30 of 69 Employees" in Incentive Data Entry

### Root Cause

`src/components/incentive/ProductionDailyGrid.tsx` (lines 73–78) fetches profiles to resolve program mappings using a **direct unpaged Supabase query**:

```ts
const { data: allProfiles } = await supabase
  .from('profiles')
  .select('id, full_name, ...')
  .order('full_name');
```

PostgREST silently caps unranged reads at **1,000 rows**. Active roster = **2,531 employees** (confirmed via DB). When the code then filters this capped 1,000-row set against the program's department/BU/designation mappings, any matching employee whose alphabetical position is past row 1,000 is invisible to the grid.

This is the **exact same bug class** documented in `mem://architecture/profiles-query-policy` and `POLICY.md §94`. The Incentive Data Entry tab was missed in the previous app-wide audit because it lives outside the `admin/` folder we swept.

The "Saibal Kunar" line in the screenshot is just the program-mapping resolver — it's not the company filter that's hiding people. The 39 missing employees were simply never loaded.

### Fix — Apply the Existing `fetchAllPaged` Pattern

Single-file change in `src/components/incentive/ProductionDailyGrid.tsx`:

1. Import `fetchAllPaged` from `@/lib/fetchAll`.
2. Replace the unpaged `.select(...).order('full_name')` call with a paged loop using `.range(from, to)` inside `fetchAllPaged`.
3. Keep `is_active = true` filter so deactivated employees are correctly excluded from production data entry (they shouldn't earn incentives).
4. Same select shape, same downstream filter logic — purely a data-layer fix.

```ts
const allProfiles = await fetchAllPaged<any>((from, to) =>
  supabase
    .from('profiles')
    .select('id, full_name, employee_code, email, designation, company_id, department_id, departments(id, name, business_unit_id, business_units(id, division_id, divisions(id, company_id)))')
    .eq('is_active', true)
    .order('full_name')
    .range(from, to)
);
```

### Audit Sweep — Other Incentive Files

While here, also audit and fix sibling incentive components that may share the bug:

- `VesselDataEntryGrid.tsx` — vessel-program employee resolution
- `ProductionTargetGrid.tsx` — target-program employee resolution
- `EligibilityDataEntry.tsx` — eligibility picker (the other tab on this page)
- `ProgramEmployeeMapping.tsx` — the mapping selector itself
- `IncentiveDataExport.tsx` — export employee resolution
- `MonthlyIncentiveTable.tsx` / `RetroactiveAdjustmentTable.tsx` — report grids

Any unpaged `supabase.from('profiles').select(...)` list-fetch in the above gets converted to `fetchAllPaged`. `.maybeSingle()` and `.in('id', [...])` lookups stay as-is per policy.

### Files Changed

| File | Change |
|---|---|
| `src/components/incentive/ProductionDailyGrid.tsx` | Wrap profiles fetch in `fetchAllPaged`, add `is_active=true` |
| `src/components/incentive/VesselDataEntryGrid.tsx` | Same, if applicable after audit |
| `src/components/incentive/ProductionTargetGrid.tsx` | Same, if applicable after audit |
| `src/components/incentive/EligibilityDataEntry.tsx` | Same, if applicable after audit |
| `src/components/incentive/ProgramEmployeeMapping.tsx` | Same, if applicable after audit |
| `src/components/incentive/IncentiveDataExport.tsx` | Same, if applicable after audit |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Same, if applicable after audit |
| `src/components/incentive/RetroactiveAdjustmentTable.tsx` | Same, if applicable after audit |
| `DOCUMENTATION.md` | v2.66.7.12 entry — incentive grids now obey Profiles Query Policy |
| `POLICY.md` | §94 reaffirmed; note incentive module compliance |
| `mem://features/incentive/core-engine-specifications` | Append: incentive grids must use `fetchAllPaged` for profile resolution |

### Risk & Impact Report

- **Data Impact**: None on stored data. Restores previously-hidden employees to the grid — strictly additive.
- **Workflow Impact**: Positive. All 69 mapped employees will now appear in the daily production entry grid. Previously-entered values for visible employees are unaffected; previously-invisible employees become editable.
- **UI/UX**: Same grid, same columns. Just complete rows.
- **Performance**: 3 paged requests (~2.5k rows) instead of 1 capped (1k). Cached by React Query per `programId`. Trivial overhead, paid only when the program is selected.
- **Regression Risk**: Very low. Identical select shape, well-trodden helper used in 6+ other places already. No schema, RLS, or business logic touched.
- **Mitigation**: Existing regression test (`employeePickerPaging.test.ts`) already covers this pattern; no new test needed for the same code path. Add a brief assertion to that test referencing the incentive use-case if helpful.

### Out of Scope

- Backend rate-resolution logic (`resolveEmployeeRate`) — unchanged.
- Mapping editor UX — separate concern.
- Adding deactivated employees back to production data entry (intentionally excluded by `is_active=true`).

