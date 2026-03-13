

# RCA & CAPA: Org KPI Propagation Gaps

## Root Cause Analysis

After investigating all 71 orphaned org-level KPIs stuck at `kra_set` with no `review_submissions` for February 2026, I identified **4 distinct root causes**:

### RC1: Blanket Status Update on NULL Values (17 KPIs)
**What happened**: When "Save & Propagate" is clicked, the propagation loop correctly skips employees where `achievedValue === null && !isNa`. However, the `org_kpi_values.status` was still being updated to `propagated` for ALL rows (the old blanket update bug). After our fix, the status update is scoped — but the **damage from before the fix persists**: 17 `org_kpi_values` entries have `achieved_value = NULL` but `status = propagated/approved`.

**Impact**: These show up in the UI as "propagated" but the employee scorecard has no data.

### RC2: Repair Function Missed 1 Record (1 KPI)  
**What happened**: The `repair-orphaned-propagations` edge function found Sandeep Kumar Tiwari's "Plantation and maintenance" KPI with `achieved_value = 264` and `status = propagated`, but it has no `review_submission`. The repair function may have hit the batch limit or had a matching error.

### RC3: Employee-Scoped KPIs with Only Org-Wide Values (15 KPIs)
**What happened**: These KPIs have `org_level_scope = employee`, meaning the system expects per-employee entries in `org_kpi_values`. But only an org-wide entry (employee_id = NULL) exists. The propagation code in `fetchTargetKpis` matches on exact `kra_name` + `kpi_name` + `employee_id`, so org-wide entries don't reach employee-scoped KPIs.

**Root cause**: These KPIs were likely created with scope "employee" but data was entered at the organization level.

### RC4: KPI Name Mismatches Between Tables (28 KPIs)
**What happened**: The `kpis` table and `org_kpi_values` table have the SAME category + KRA but **different KPI names**. Examples:
- kpis: `"Timely Resolution of Employee Grievances..."` vs org_kpi_values: (no match at all — 7 orphans)
- kpis: `"Total Recordable Injury (STI)..."` vs org_kpi_values: `"Closure within 15 Days Proactive Safety Reporting..."`
- kpis: `"Power generation from 45 MWh/WHRB..."` vs org_kpi_values: `"Achieve 3*100 TPD Power Generation..."`

This happens because KPI names in templates were edited/renamed after assignment, creating a mismatch between what employees received and what data owners see.

### RC5: No Data Entered (10 KPIs)
No `org_kpi_values` exist at all. Data simply hasn't been entered yet. No system issue.

---

## CAPA (Corrective & Preventive Actions)

### Corrective Action 1: Fix Remaining Orphaned Records (Data Repair)
- Re-run the repair function for the 1 missed record (Sandeep's Plantation KPI)
- For the 17 NULL-value records: reset `org_kpi_values.status` back to `entered` (or `pending`) so data owners see them as needing input
- These are one-time data fixes via edge function

### Corrective Action 2: Add Fuzzy/Fallback Matching for Propagation
In `fetchTargetKpis`, when exact `kpi_name` match returns 0 results, fall back to matching on `category_id + kra_name` only (ignoring kpi_name). Since org-level KPIs within the same category+KRA are typically the same metric with different naming, this handles the 28 mismatched records.

### Preventive Action 1: Prevent Blanket Status Updates on NULL Values
Already fixed in the previous iteration. The `handleCardSaveAndPropagate` now only updates status for actually-propagated scope IDs.

### Preventive Action 2: Add Name Mismatch Detection
Add a diagnostic in the Org KPI Data Entry page that warns when `org_kpi_values` KPI names don't match any `kpis` records for the same employee. This catches naming mismatches before they become orphans.

### Preventive Action 3: Validate Propagation Completeness
After each "Save & Propagate", verify the count of updated `review_submissions` matches the expected employee count. If fewer records were updated, show a warning toast with the count of skipped employees.

---

## Implementation Plan

### Files to Modify

1. **`src/hooks/usePropagateOrgKpiValue.ts`** — Add fallback matching: if exact `kpi_name` match returns 0 results, retry with `category_id + kra_name` only
2. **`supabase/functions/repair-orphaned-propagations/index.ts`** — Enhance to handle:
   - KPI name mismatches (fallback to category+kra matching)
   - NULL achieved_value entries (reset status to pending)
   - Re-run for the 1 missed record
3. **`src/pages/admin/OrgKpiDataEntry.tsx`** — Add post-propagation validation that compares propagated count vs expected employee count and warns on mismatch

### Execution Order
1. Fix the propagation hook with fallback matching (prevents future orphans)
2. Enhance and re-run the repair function (fixes existing orphans)
3. Add validation warnings (prevents silent failures going forward)

