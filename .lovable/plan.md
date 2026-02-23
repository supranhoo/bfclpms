

# Add Employee-wise KPI Count Chart with Department Filter (v1.45.88)

## What's Being Added

A new **"By Employee"** stacked bar chart -- identical in style to the existing "By Department" chart -- showing per-employee pending KPI counts broken down by workflow stage. This chart will have its own **Department dropdown filter** so admins can drill into a specific department's employees.

## Layout Change

The charts section (Row 3) will expand from a single row to two rows:

**Row 3a** (existing): Urgency Donut (1/3) + By Department chart (2/3)

**Row 3b** (new): Full-width "By Employee" stacked bar chart with a Department filter dropdown in the card header. Shows top 15 employees sorted by total pending KPIs descending.

## Technical Changes

### 1. `src/hooks/useBottleneckReport.ts`

- Add a new state: `employeeChartDepartment` (default `'all'`)
- Add a new computed value: `employeeChartData` -- aggregates `filteredRows` by `employeeName` (further filtered by `employeeChartDepartment` if set), groups by stage, sorts by total descending, caps at top 15
- Export both the new state setter and computed data

### 2. `src/pages/reports/BottleneckReport.tsx`

- After the existing charts row (Row 3), add a new Card containing:
  - Card header with title "By Employee" and a compact Department `<Select>` dropdown (top-right of card header)
  - A horizontal stacked `BarChart` (same style as By Department) with employee names on the Y-axis
  - Same color coding per stage as the department chart
- Wire the Department filter to `employeeChartDepartment` from the hook

### 3. `DOCUMENTATION.md`

- Bump version to **1.45.88**
- Document the new employee-wise chart section

## Risk Assessment

| Aspect | Risk |
|--------|------|
| Data impact | None -- read-only aggregation of existing data |
| Regression risk | None -- additive chart, no existing code modified |
| Performance | Minimal -- reuses already-fetched `filteredRows`, just a different grouping |

