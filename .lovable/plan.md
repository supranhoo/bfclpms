

# Show Auto-Calculated Achieved Value to Reviewers

## Problem
When an employee submits a KPI with an auto-calculated achieved value (from daily aggregation or threshold-based auto-calculation), the next reviewer in the workflow cannot see this value in the main KPI table. The value IS stored in the database (`review_submissions.achieved_value`) and IS visible inside the review journey cards when you open a KPI, but the KPI Details Table -- the primary working surface for reviewers -- has no "Achieved" column.

## Current State
- **KpiDetailsTable columns**: Category, KRA/KPI, Target, Weightage, [Score columns], Status, Actions
- **Missing**: No "Achieved Value" column to show what the employee actually achieved
- The reviewer must click into each KPI individually to see what was achieved

## Solution
Add an **"Achieved"** column to the `KpiDetailsTable` between "Weightage" and the first score column. This column will display:

1. For regular KPIs: `submission.achieved_value` (the employee's submitted or auto-aggregated value)
2. For Org KPIs: the value from `getOrgKpiValue()` if available, falling back to `submission.achieved_value`
3. The UOM suffix (e.g., "85%", "12 Days") for context
4. A dash ("—") if no value has been entered yet

## File Changes

### `src/components/review/KpiDetailsTable.tsx`

1. Add a new "Achieved" column header after "Weightage" in the table header row
2. Add a new cell in each table row that renders:
   - `orgValue?.achieved_value ?? submission?.achieved_value` with the KPI's UOM unit appended
3. Update `totalColumns` calculation to account for the new column (+1)
4. For Org KPIs, use the `getOrgKpiValue` prop (already passed in) to show centrally-entered values

**~15 lines changed across 3 locations in 1 file. No DB migration.**

