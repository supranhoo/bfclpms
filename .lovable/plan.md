

# Plan: Bulk Apply KPI Changes Across Months

## Problem
When an admin edits a KPI's structural fields (target, thresholds, weightage, UOM, etc.) in the Admin KPI Editor, the change only applies to the single selected month. If the same KPI exists across 12 months, the admin must repeat the edit 12 times.

## Solution
Add a **"Apply To" scope selector** in the Admin KPI Edit Dialog that lets the admin choose how broadly to apply structural changes:

1. **This month only** (default — current behavior)
2. **All future months** — applies to months after the current KPI's month in the same year
3. **All months** — applies to every month in the same year for this employee+KRA+KPI

## How It Works

### Sibling KPI Matching
Find all KPIs with the same `employee_id`, `kra_name`, `kpi_name`, and `review_year` but different `review_period`. Filter by month index relative to the current KPI's month based on the selected scope.

### Fields That Propagate
Structural/config fields only: `target_value`, `uom`, `weightage`, `criteria`, `r0`–`r5`, `frequency`, `frequency_cycle_start`, `source_of_data`, `is_org_level`, `org_level_scope`, `uom_type`, `qualitative_options`, `require_resubmit_reason`, `day_count_type`, `threshold_mode`.

### Fields That Do NOT Propagate
- `review_period` (each KPI keeps its own month)
- `status` (workflow position is per-month)
- Achieved values / scores (data integrity)

### UI Placement
A radio group placed above the "Reason for Change" textarea, inside a highlighted info box:
- Radio: This month only | All future months | All months
- Helper text explaining what will happen

### Execution Flow
1. Admin edits fields and selects scope
2. On save: first update the current KPI (existing logic)
3. If scope ≠ "this_month": query sibling KPIs by matching criteria, filter by month scope, batch-update them with the same structural fields
4. Each sibling update gets its own audit log entry with `source: 'admin_bulk_apply'`
5. Toast shows count: "KPI updated + X sibling months updated"

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/AdminKpiEditDialog.tsx` | Add apply-scope radio group state, pass scope to submit handler, implement sibling query + batch update logic after primary save |
| `src/hooks/useKpis.ts` | No changes needed — the dialog will handle sibling updates directly since `useAdminUpdateKpi` already handles single-KPI updates with audit logging |

## Risk Assessment
- **Data Impact**: Only structural fields propagate; scores and statuses are untouched. Each update is individually audited.
- **Regression Risk**: Low — default is "this month only" which preserves current behavior exactly.
- **Performance**: At most 11 additional updates (one per sibling month), each lightweight.

