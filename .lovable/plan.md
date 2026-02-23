

# Fix: Blank Target Values in Department-Scoped Org KPI Rows

## Problem

The screenshot shows a "Per Department" Org KPI where all Target columns display "—" (blank). The card header shows "Target: 14" but this value is not passed down to individual department rows.

## Root Cause

Two issues found:

1. **Data layer** (`OrgKpiDataEntry.tsx`, line 346-354): When building department-scoped rows, the code does NOT include `targetValue` or `uom` in the row objects.

2. **UI layer** (`OrgKpiScopedEntryTable.tsx`, line 322-324): The `DepartmentRow` component hardcodes the target cell as `"—"` instead of reading from `row.targetValue`.

## Fix

### 1. `OrgKpiDataEntry.tsx` -- Add target to department rows

In the department row builder (around line 346), add the KPI's `target_value` and `uom` to each department row:

```
targetValue: kpi.target_value ?? null,
uom: kpi.uom ?? null,
```

Since department-scoped KPIs share the same target across all departments, the KPI-level target is correct here.

### 2. `OrgKpiScopedEntryTable.tsx` -- Render target in DepartmentRow

Replace the hardcoded "—" in `DepartmentRow`'s target cell (line 322-324) with actual `row.targetValue` and `row.uom` display, using the same pattern already used in `EmployeeRow`.

### 3. `DOCUMENTATION.md` -- Version bump to 1.45.79

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `OrgKpiDataEntry.tsx`, `OrgKpiScopedEntryTable.tsx`, `DOCUMENTATION.md` |
| Data impact | None -- using existing KPI target values |
| DB changes | None |
| Regression risk | None -- fixing a display omission |

