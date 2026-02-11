

# Export Current Data -- Fix Zero-Bug and Add Missing Columns

## Problems Found

### Problem 1: Zero Values Silently Dropped (Critical)
The export function uses `|| ''` on all score/achieved fields. Since JavaScript treats `0` as falsy, any KPI with a score of `0` exports as blank. This is the **same truthy bug** we just fixed in the report and import -- but it was never fixed in the export.

Affected lines (1639-1662):
- `targetAchieved: submission?.achieved_value || ''` -- drops `0`
- `employeeRating: submission?.self_score || ''` -- drops `0`
- `managerRating: submission?.manager_score || ''` -- drops `0`
- `auditRating: submission?.auditor_score || ''` -- drops `0`
- `finalScore: submission?.final_score || ''` -- drops `0`
- Also: `kpi.target_value || ''`, `kpi.weightage || ''` -- drops `0`

**Fix:** Replace all `|| ''` with `?? ''` for numeric fields.

### Problem 2: Missing Columns (11 columns)
The export does not include several columns that the import template expects. If a user exports data, edits it, and re-imports, these columns are lost.

Missing columns:
1. `sNo` -- Row serial number
2. `reviewStatus` -- Derived from `performance_reviews.status`
3. `division` -- From employee's department hierarchy
4. `businessUnit` -- From employee's department hierarchy
5. `department` -- From employee's department
6. `subBranch` -- From employee's sub-branch
7. `frequencyCycleStart` -- From `kpis.frequency_cycle_start`
8. `kpiStatus` -- From `kpis.status`
9. `isOrgLevel` -- From `kpis.is_org_level`
10. `employeeTargetAchieved` -- From `review_submissions.achieved_value` (self-review achieved)
11. `managerTargetAchieved` -- From `review_submissions.manager_achieved_value`
12. `auditTargetAchieved` -- From `review_submissions.auditor_achieved_value`
13. `achievedWeight` -- Calculated field (not stored, can be left blank)

## Pros and Cons

### Pros
- **Round-trip fidelity**: Export then re-import produces identical data -- no silent data loss
- **Audit trail**: Users can verify all stored values including `0` scores before re-importing
- **Debugging**: Makes it easy to spot import issues by comparing exported vs uploaded data
- **Backup**: Serves as a complete data backup in the same format as import

### Cons
- **Slightly wider file**: 11 more columns, but these are all lightweight text/number fields
- **Query complexity**: Export needs to join `profiles -> departments -> business_units -> divisions` (already done in employee export, just needs replication here)
- **Performance review join**: Need an additional query to fetch `performance_reviews.status` for the `reviewStatus` column -- adds one more paginated fetch

## Changes

### File: `src/pages/admin/ImportData.tsx` -- `exportKpiData` function (lines 1563-1684)

1. **Fix zero-bug**: Replace `|| ''` with `?? ''` for all numeric fields (`target_value`, `weightage`, `achieved_value`, `self_score`, `manager_score`, `auditor_score`, `final_score`, `manager_achieved_value`, `auditor_achieved_value`)

2. **Add missing select columns**: Update the KPI query to also fetch:
   - `frequency_cycle_start`
   - `is_org_level`
   - `status` (already fetched)
   - Employee profile with department hierarchy (department -> business_unit -> division)

3. **Add review_submissions columns**: Update the submission query to also fetch:
   - `manager_achieved_value`
   - `auditor_achieved_value`
   - `management_score`
   - `management_remarks`

4. **Add performance_reviews query**: New paginated fetch to get `performance_reviews` with `employee_id`, `review_period`, and `status` to map the `reviewStatus` column

5. **Rebuild export row**: The export object will include all template columns in the same order as the template:

```text
sNo, refCode, month, reviewStatus, newCode, fullName,
division, businessUnit, department, subBranch,
category, kra, kpi, uom, uomType, qualitativeOptions,
frequency, frequencyCycleStart, kpiWeightage, criteria, target,
r5, r4, r3, r2, r1, r0,
targetAchieved, achievedWeight, rating, kpiWeightageScore,
employeeTargetAchieved, employeeRating, employeeRemarks,
managerTargetAchieved, managerRating, managerRemarks,
auditTargetAchieved, auditRating, auditRemarks,
sourceOfData, kpiStatus, isOrgLevel
```

### File: `DOCUMENTATION.md`
- Update section 4.19 to note the export function was also affected by the zero-truthy bug
- Add note about export-import column parity

