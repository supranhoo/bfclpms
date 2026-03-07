

# Plan: Add Inline Weightage Editing with Forward Propagation on KPI Weightage Dashboard

## Problem
The KPI Weightage Dashboard shows mismatches but admins must navigate to All KPIs → Edit each KPI individually to fix them. The user wants to edit weightage values directly from this dashboard and propagate changes to "this month and all following months."

## Changes

### 1. New Component: `WeightageCellEditor` (inline popover)
**File: `src/components/admin/WeightageCellEditor.tsx`**

A small Popover that opens when clicking a weightage cell in the matrix. Contains:
- A numeric **Input** for the new weightage value (pre-filled with current value)
- A **RadioGroup** with scope options:
  - "This month only"
  - "This month & all following months" (fiscal-year aware)
  - "All months" (entire fiscal year)
- A "Save" button that executes the update
- Toast feedback on success

The component receives: `employeeId`, `kraName`, `kpiName`, `month`, `year`, `currentWeightage`, `fiscalStartYear`, and an `onSuccess` callback to refetch the matrix.

**Save logic**: Queries `kpis` table for matching records by `employee_id + kra_name + kpi_name` across the fiscal year, filters by scope (using fiscal-month ordering like AdminKpiEditDialog already does), then batch-updates `weightage` on all matched KPIs. Logs each update to `kpi_audit_logs` with action `'weightage_matrix_edit'`.

### 2. Update `useKpiWeightageMatrix` hook
**File: `src/hooks/useKpiWeightageMatrix.ts`**

Store KPI IDs in the matrix data so we can update them. Add to `KpiRow`:
- `kpiIds: Record<string, string>` — maps `month -> kpi.id`

Populate this during the grouping loop.

### 3. Update KPI Weightage Dashboard
**File: `src/pages/admin/KpiWeightageDashboard.tsx`**

- Make weightage cells clickable (cursor-pointer, hover highlight)
- Render `WeightageCellEditor` popover on cell click
- Pass `fiscalStartYear` and `queryClient.invalidateQueries` for refetch on save
- Non-data cells (`--`) remain non-interactive

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/WeightageCellEditor.tsx` | New — inline popover editor with scope radio |
| `src/hooks/useKpiWeightageMatrix.ts` | Add `kpiIds` to `KpiRow` interface & populate it |
| `src/pages/admin/KpiWeightageDashboard.tsx` | Make cells clickable, render editor popover |

### Risk Assessment
- **Data Impact**: Updates `weightage` field only (structural). No status/score changes.
- **Regression**: Additive — existing read-only cells become clickable. No existing logic modified.
- **Audit**: Every change logged to `kpi_audit_logs` for traceability.

