

## Show Assigned Weightage % per Employee in KPI-Employee Matrix

### Problem
Currently, each KPI row shows a single "Wt%" column (from the first occurrence) and employee cells show weighted scores. But each employee can have a **different weightage** assigned for the same KRA/KPI. The user wants to see the **assigned weightage %** per employee in the employee columns.

### Solution
Store per-employee weightage in the matrix data and display it in the employee cells — either replacing the weighted score or showing both (weightage with score below).

### Changes

**1. `src/hooks/useKpiEmployeeMatrix.ts`**
- Add `employeeWeightages: Record<string, number>` to `MatrixKpiRow` interface
- Populate it during the pivot loop: `row.employeeWeightages[empId] = Number(kpi.weightage) || 0`
- Keep `employeeScores` as-is for the Excel export and totals

**2. `src/pages/reports/KpiEmployeeMatrix.tsx`**
- Update employee cells to display the assigned weightage % as the primary value
- Show format like `10%` (the weightage) with the weighted score as secondary text below if a score exists
- Update the company-filter logic in `filteredRows` to also carry `employeeWeightages`
- Update Excel export to include a weightage row or column

**3. `DOCUMENTATION.md` / `POLICY.md`** — version bump

### Cell Display Format
```text
  10%        ← assigned weightage (bold)
  3.50       ← weighted score (smaller, muted) — only if score exists
```

Unmapped cells remain blank. Mapped but unscored cells show only the weightage.

