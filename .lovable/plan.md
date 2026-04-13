

## Add Target & Level-wise Actual Values to KPI Scorecard Detail Excel Export

### Problem
The Excel export currently only includes scores per level but omits the **Target** value and the **Actual Value entered by each review level** (Self, Manager, Skip-Level, HR PMS, Auditor, Management).

### What Changes

**File: `src/pages/reports/KpiScorecardDetail.tsx`**

1. **Update the data query** (line ~109-113): Add `target_value` from `kpis` table and add `achieved_value, manager_achieved_value, skip_level_achieved_value, hr_pms_achieved_value, auditor_achieved_value, management_achieved_value` to the `review_submissions` select.

2. **Extend the `FlatRow` interface** (line ~25-49): Add new fields:
   - `targetValue: number | null`
   - `selfActual: number | null`
   - `managerActual: number | null`
   - `skipLevelActual: number | null`
   - `hrPmsActual: number | null`
   - `auditorActual: number | null`
   - `managementActual: number | null`

3. **Map the new fields** in the query result mapper (line ~150-183).

4. **Update `handleExport`** (line ~262-291): Insert new columns after "Weightage":
   - `Target` → from `kpis.target_value`
   - `Self Actual` → `review_submissions.achieved_value`
   - `Manager Actual` → `review_submissions.manager_achieved_value`
   - `Skip-Level Actual` → `review_submissions.skip_level_achieved_value`
   - `HR PMS Actual` → `review_submissions.hr_pms_achieved_value`
   - `Auditor Actual` → `review_submissions.auditor_achieved_value`
   - `Management Actual` → `review_submissions.management_achieved_value`

   These columns appear between "Weightage" and "Self" (score) in the export, giving a clear separation between actual values and scores.

5. **Update DOCUMENTATION.md and POLICY.md** version history.

### No UI Table Change
These columns are added **only to the Excel export** — the on-screen table remains unchanged to keep it readable.

### Risk Assessment
- **Data impact**: None — read-only query additions
- **Regression risk**: Very low — only the Excel export mapping changes
- **UX impact**: Positive — more complete data in exports for payroll/audit use

