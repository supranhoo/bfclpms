
## RCA: Compliance KPI 4-factor values missing from Org KPI Data Entry

### What I verified
- The earlier fixes are already present in code:
  - `OrgKpiDataEntry.tsx` now saves `sub_factors`
  - `OrgKpiDataEntry.tsx` now loads `sub_factors` into `subFactors`
  - `useOrgKpiValues.ts` reads/writes `sub_factors`
  - `KpiJourneySection.tsx` reads `sub_factors` for display
- So this is not just the old “field not mapped” bug anymore.

### Current likely root-cause candidates
1. **Data is actually gone/null in the database**
   - Most likely if HR can no longer see previously entered factors even after the load/save mapping fix.
   - This would explain both:
     - missing values in Org KPI data entry
     - missing values in review journey

2. **The affected employee rows are no longer part of the KPI’s mapped employee set**
   - `OrgKpiDataEntry` only shows employees returned by `useOrgLevelKpisWithEmployees`.
   - That hook derives visible employee rows from current `kpis` records for the selected month/year.
   - If employee mapping changed, KPI assignment changed, or period/year differs, old `org_kpi_values` rows can still exist in DB but not appear in the UI.

3. **An overwrite path is still nulling `sub_factors`**
   - There is still a risk path in autosave/update flows if a row is re-saved without intended factor state in some edge case.
   - This needs DB verification against actual affected rows before changing code again.

### Important code findings
- `OrgKpiDataEntry.tsx`
  - builds visible rows from `mappedEmployeesMap` / `mappedDepartmentsMap`
  - loads `subFactors: val?.sub_factors ?? undefined`
  - saves `...(sv.subFactors ? { sub_factors: sv.subFactors } : {})`
- `useOrgLevelKpisWithEmployees.ts`
  - limits visible Org KPI rows to employees who currently have matching `kpis` records for selected period/year
- `useComplianceSubFactors.ts`
  - review journey reads only employee-scoped `org_kpi_values` row matching:
    - category
    - KRA
    - KPI
    - period
    - year
    - employee_id

### Risk & Impact Report
- **Data impact**: High likelihood this involves persisted data state, not only UI state
- **Workflow impact**: Medium; missing compliance metadata affects HR visibility and all downstream review viewers
- **UI/UX consistency**: Low risk if fixed carefully; likely no layout changes needed
- **Regression risk**: Medium; repeated patching without DB confirmation may reintroduce overwrite bugs
- **Mitigation**:
  - inspect exact DB rows for employee codes `100231` and `100624`
  - compare `kpis` assignment rows vs `org_kpi_values` rows for March
  - add regression tests for load/save + visibility + mapping edge case
  - add mock fixtures covering “row exists but employee mapping changed”

### Plan
1. **Inspect actual database rows for the affected cases**
   - Check employee IDs for `100231` and `100624`
   - Query March compliance KPI rows in `org_kpi_values`
   - Verify whether `sub_factors` is:
     - present
     - null
     - missing due to no row
   - Cross-check matching `kpis` rows for the same employees/period

2. **Classify the real failure mode**
   - If rows exist but `sub_factors` is null: trace overwrite path and patch the mutation flow
   - If rows exist with data but UI still hides them: patch row visibility/loading logic
   - If rows no longer exist in visible KPI mapping: patch admin view to surface persisted scoped rows even when current mapping changed

3. **Implement the fix**
   - Most likely candidate if DB rows still exist:
     - merge visible scoped rows from both:
       - current mapped employees
       - persisted `org_kpi_values` scoped rows
   - This prevents old HR-entered compliance data from disappearing from the Org KPI screen when employee mapping changes later
   - If overwrite is confirmed, add defensive merge/update logic so missing `subFactors` never clears existing JSON unintentionally

4. **Add regression protection**
   - Unit tests for:
     - loading persisted `sub_factors`
     - saving without clearing existing `sub_factors`
     - showing persisted employee rows even if current employee mapping differs
   - Mock data for affected compliance KPI scenarios

5. **Sync documentation**
   - Update `DOCUMENTATION.md`
   - Update `POLICY.md`
   - include RCA note and regression coverage note

### What needs approval
Because I’m in read-only mode, the next step must be a runtime/data inspection plus code/test changes. After approval, I will:
- inspect the exact database state for `100231` and `100624`
- identify whether this is deletion, filtering, or overwrite
- implement the targeted fix with tests and doc/policy sync
