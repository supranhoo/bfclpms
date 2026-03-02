

# Admin KPI Weightage Dashboard

## Overview
A new admin-only page at `/admin/kpi-weightage-dashboard` that displays a matrix/pivot table showing each employee's KRAs and KPIs with their weightage values across all months, making it easy to spot mismatches and ensure consistency.

## Layout

```text
+---------------------------------------------------------------+
| KPI Weightage Dashboard                          [Year: 2026] |
| [Employee Filter] [Department Filter] [Category Filter]       |
+---------------------------------------------------------------+
| Employee: Amit Kumar Shaw (101804)          Total Weightage:   |
|                                             Jan:100 Feb:100... |
+-----------------------------+-----+-----+-----+-----+-----+---+
| KRA / KPI                   | Jan | Feb | Mar | Apr | ... |   |
+-----------------------------+-----+-----+-----+-----+-----+---+
| > Safety & Compliance       |     |     |     |     |     |   |
|   Follow safety norms       |  5% |  5% |  5% |  -- |     |   |
|   5S audit score             |  3% |  2% |  3% |  -- |     |   |
| > Operations                |     |     |     |     |     |   |
|   On-time MIS reports       |  5% |  5% |  5% |  -- |     |   |
+-----------------------------+-----+-----+-----+-----+-----+---+
| Employee: Piyush Bansal (100076)            Total Weightage:   |
| ...                                                            |
+---------------------------------------------------------------+
```

- Mismatched cells (where weightage differs from January baseline) highlighted in amber/red
- Month columns only show months that have KPI data
- Collapsible employee sections for easy navigation
- Export to Excel option

## New Files

1. **`src/pages/admin/KpiWeightageDashboard.tsx`** -- Main page component with:
   - Year selector (default: current year)
   - Employee, department, and category filters
   - Fetches all KPIs for the selected year grouped by employee
   - Renders a pivot table: rows = KRA/KPI, columns = months
   - Color-coded cells: green (matches baseline), amber (mismatch), gray (no data)
   - Per-employee total weightage row per month
   - Excel export button

2. **`src/hooks/useKpiWeightageMatrix.ts`** -- Data hook that:
   - Queries `kpis` table for all employees in a given year
   - Joins with `profiles` for employee info and `kra_categories` for category names
   - Groups data into: `Employee -> KRA -> KPI -> { month: weightage }`
   - Computes per-month totals and flags mismatches

## Changes to Existing Files

3. **`src/App.tsx`** -- Add lazy import and route `/admin/kpi-weightage-dashboard` under admin ProtectedRoute

4. **`src/components/layout/AppSidebar.tsx`** -- Add sidebar entry "Weightage Matrix" with `PercentIcon` icon in the admin section

## Technical Details

- Query uses the existing `kpis` table filtered by `review_year`
- Groups by `employee_id`, `kra_name`, `kpi_name`, `review_period`
- No database changes needed
- Follows existing patterns: lazy loading, ProtectedRoute, card-based layout, shadcn Table component
- Mismatch detection: compares each month's weightage to the first available month (January baseline)

