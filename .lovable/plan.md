

# Enhance Org KPI Locked Card with Data Owner Status Transparency

## Problem
When an employee sees a locked Org KPI in their self-review, the card only shows a generic message: "Data will be entered by the designated Data Owner." The employee has no visibility into:
- **Who** the Data Owner is
- **Whether** data has already been entered (just not propagated yet)
- The current **status** of the data pipeline (Pending → Entered → Propagated)

## Solution
Enhance the locked card in `SelfReviewSheet.tsx` to display:
1. **Data Owner name(s)** — fetched via the existing `useOrgKpiOwners` hook
2. **Entry status** — derived from `orgKpiValue` (the existing variable already in scope):
   - **Pending** (no value entered yet) — amber badge
   - **Entered** (value exists but not propagated) — blue badge
   - **Propagated** (value pushed to scorecard) — green badge, plus the achieved value

## Changes

### `SelfReviewSheet.tsx` — enhance the `isOrgLocked` block (~lines 572-589)

- Import `useOrgKpiOwners` from `useOrgKpiDataOwner.ts`
- Call `useOrgKpiOwners(selectedKpi.category_id, selectedKpi.kra_name, selectedKpi.kpi_name)`
- Replace the static message with:
  - A status indicator (Pending / Entered / Propagated) with color-coded badge
  - Data Owner names listed (e.g., "Assigned to: John Smith, Jane Doe")
  - If propagated, show the achieved value
  - If pending, show "Awaiting data entry from [Owner Name]"

**1 file changed, ~20 lines modified. No DB migration.**

