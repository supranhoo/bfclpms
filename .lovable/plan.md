
# Enhancement: Total Weightage Display on Admin KPI Dashboard

## What the User Wants

Below the employee name in the "KPI Status by Employee" table, a small cosmetic line showing **Total Weightage** (e.g. `100856 · Total Weightage: 102%`) must appear — but only when a specific month is selected in the period filter. When "All Periods" is selected, this stays hidden.

## Zero Logic Impact Guarantee

This is a purely additive, display-only change:
- No queries are added or changed
- No database calls are added
- The weightage is already loaded on every KPI object (`kpi.weightage`) — it just needs summing during the existing `employeeData` aggregation pass
- No existing computed values are modified

---

## Changes Required

### File: `src/pages/admin/AllKpis.tsx`

**Change 1 — Add `totalWeightage` to the `EmployeeKpiData` interface (line 41–51)**

```typescript
// BEFORE
interface EmployeeKpiData {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  managerName: string;
  totalKpis: number;
  orgLevelKpis: number;
  stageCounts: Record<string, number>;
  stageQueryCounts: Record<string, number>;
}

// AFTER — add one field
interface EmployeeKpiData {
  ...
  totalWeightage: number;  // ← new
}
```

**Change 2 — Initialise and accumulate `totalWeightage` inside the `employeeData` useMemo (lines 178–206)**

When a new employee entry is created in the map, initialise `totalWeightage: 0`. Then on each KPI loop iteration, add `kpi.weightage ?? 0` to it. This happens inside the **existing single-pass loop** — no extra iteration.

```typescript
// In the map initialisation:
totalWeightage: 0,

// In the accumulation loop:
data.totalWeightage += (kpi.weightage ?? 0);
```

**Change 3 — Show the badge conditionally in the table cell (lines 550–556)**

Currently the subtitle line reads:
```tsx
<div className="text-xs text-muted-foreground">
  {emp.employeeCode && <span>{emp.employeeCode} · </span>}
  {emp.departmentName}
</div>
```

The updated version:
```tsx
<div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
  {emp.employeeCode && <span>{emp.employeeCode}</span>}
  {emp.employeeCode && <span>·</span>}
  <span>{emp.departmentName}</span>
  {selectedPeriod !== 'all' && (
    <>
      <span>·</span>
      <span className={emp.totalWeightage > 100
        ? 'text-destructive font-medium'
        : emp.totalWeightage === 100
          ? 'text-green-600 font-medium'
          : 'text-amber-600 font-medium'
      }>
        {emp.totalWeightage}% weightage
      </span>
    </>
  )}
</div>
```

**Colour coding rationale** (purely cosmetic, no logic impact):
| Total Weightage | Colour |
|---|---|
| = 100% | Green — correct |
| > 100% | Red/destructive — over-allocated |
| < 100% | Amber — under-allocated |

This gives the admin an instant at-a-glance health check without opening the expanded view.

---

## Visibility Rule

`selectedPeriod !== 'all'` — the weightage segment only renders when a specific month is selected. This matches the user's requirement exactly: hidden when "All Periods" is shown, visible when any month is active.

---

## Files to Change

| File | Section | Change |
|---|---|---|
| `src/pages/admin/AllKpis.tsx` | Line 41–51 | Add `totalWeightage: number` to `EmployeeKpiData` interface |
| `src/pages/admin/AllKpis.tsx` | Lines 178–206 | Initialise and accumulate `totalWeightage` in the useMemo |
| `src/pages/admin/AllKpis.tsx` | Lines 550–556 | Render conditional weightage pill in the employee subtitle |
| `DOCUMENTATION.md` | — | Version bump to 1.45.6 + note |

## Impact Assessment

- No API calls added
- No existing computed values changed
- No existing UI components removed or restructured
- The `filteredKpis` already restricts data to the selected month, so `totalWeightage` naturally reflects only that month's KPIs
- Works correctly even when employee has 0 KPIs in the filter (shows 0%)
