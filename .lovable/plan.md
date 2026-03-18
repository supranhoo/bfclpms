

## Issue: "Data entered by" Shows When No Data Exists for This Employee

### Root Cause

The **fallback logic** we added in the previous fix is too aggressive. For employee-scoped Org KPIs that haven't been propagated yet, `getOrgKpiValue()` falls back to the **organization-level record** (the base record with `employee_id=null`). That record has `entered_by_name = "Ankit Choudhary"` because Ankit entered the org-level value.

But the employee's KPI has no actual data — status is "KRA SET", score is 0, achieved value is 0/20. The "Data entered by: Ankit Choudhary" badge is misleading because Ankit entered data at the org level, not for this specific employee.

### Fix

**Only show "Data entered by"** when data was actually propagated or entered for this employee — i.e., when the org KPI value record has a non-null `achieved_value`.

**Files to change:**

1. **`src/components/review/KpiHeaderSection.tsx`** (line 157): Add condition to check that `achieved_value` exists before showing the badge. This requires passing `orgKpiAchievedValue` as a new prop.

2. **`src/components/review/KpiReviewPanel.tsx`**: Pass the achieved value through.

3. **All 4 scorecards** (`UnifiedScorecard.tsx`, `EmployeeScorecard.tsx`, `ManagementScorecard.tsx`, `AuditScorecard.tsx`): Pass `orgKpiAchievedValue` when opening the KPI detail panel.

**Alternative (simpler):** Instead of adding a new prop, just condition the "Data entered by" display on `orgKpiEnteredByName` being different from the fallback — but the cleanest approach is: **in `KpiHeaderSection`, only show "Data entered by" when the KPI has an actual submission or achieved value.** We can check the existing `kpi.status` — if it's `kra_set`, there's no data entry to attribute.

**Simplest fix (1 file, 1 line):**
In `KpiHeaderSection.tsx` line 157, change:
```typescript
{orgKpiEnteredByName && (
```
to:
```typescript
{orgKpiEnteredByName && kpi.status !== 'kra_set' && (
```

This hides the misleading badge when the KPI hasn't progressed past the initial stage. If data has been propagated, the status would have advanced.

