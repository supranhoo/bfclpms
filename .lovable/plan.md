
# Fix: Show Employee-Specific Targets in Org KPI Data Entry

## Problem Found

The database confirms that **employees DO have different targets** for the same Org KPI. For example, under "Plantation and maintenance of saplings":

| Employee | Actual Target |
|----------|--------------|
| Anant Shankar Shet | 70 |
| Sindhu Raj Singh | 140 |
| Anil Kumar Pathak | 35 |
| Bhoopendra Kumar Sinha | 14 |

However, the current code takes a single `targetValue` from one representative KPI record and displays it uniformly on every employee row. This is incorrect.

## Root Cause

In `OrgKpiDataEntry.tsx` (line 386), `targetValue: kpi.target_value` comes from the first KPI record in the org-level group. This single value is then passed to `OrgKpiScopedEntryTable`, which renders it on every employee row (lines 220-225).

The `ScopedRow` interface does not include a per-row target value -- it only has `achievedValue`, `remarks`, etc.

## Solution

### 1. Extend `ScopedRow` interface (`OrgKpiScopedEntryTable.tsx`)

Add `targetValue` and `uom` fields to `ScopedRow`:

```
targetValue?: number | null;
uom?: string | null;
```

### 2. Look up each employee's individual target (`OrgKpiDataEntry.tsx`)

When building the scoped rows (around line 349-377), query the employee's own KPI record to get their specific `target_value`. The mapped employee KPI records are already available through the `orgLevelData` hook -- we need to extract per-employee targets from those records.

### 3. Render per-row target in `EmployeeRow` (`OrgKpiScopedEntryTable.tsx`)

Change the Target cell to use `row.targetValue` (per-employee) when available, falling back to the card-level `targetValue` prop.

### 4. Same for out-of-range warnings

The out-of-range check currently uses the card-level `targetValue`. It must use the employee's individual target for accurate validation.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `OrgKpiScopedEntryTable.tsx`, `OrgKpiDataEntry.tsx`, `DOCUMENTATION.md` |
| Data source | Individual `kpis.target_value` per employee (already in DB, just not read into scoped rows) |
| DB changes | None |
| RLS impact | None |
| Regression risk | Low -- additive change to existing data flow |

## Implementation Steps

1. **Add fields to `ScopedRow`**: `targetValue?: number | null` and `uom?: string | null`.
2. **Populate per-employee targets** in `OrgKpiDataEntry.tsx` by looking up each employee's KPI record from the org-level data and extracting their `target_value`.
3. **Update `EmployeeRow`** to prefer `row.targetValue` over the card-level prop.
4. **Update out-of-range calculation** in `EmployeeRow` to use the employee's own target.
5. **Version bump** to 1.45.78.
