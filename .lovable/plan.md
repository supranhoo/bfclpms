

# Show "Filled / Total" for Org-Level KPIs in All KPIs Page

## Problem
The "Org-Level" column currently shows only the total count of org-level KPIs per employee. The user wants it to show how many have data filled (e.g., "3/4") vs just "4".

## Approach
For each employee, count how many of their org-level KPIs have a corresponding `org_kpi_values` row with data entered (`achieved_value IS NOT NULL` or `is_na = true`). This requires fetching `org_kpi_values` for the selected period/year.

## Changes

### File: `src/pages/admin/AllKpis.tsx`

1. **Add `orgLevelFilledKpis` to the `EmployeeKpiData` interface** (line 49) — new field to track filled count.

2. **Fetch org_kpi_values for the selected period** — Add a query using `supabase.from('org_kpi_values')` filtered by `review_period` and `review_year`, scoped to employee-level entries. Build a lookup Set of filled keys (`category_id||kra_name||kpi_name||employee_id`).

3. **Count filled org KPIs per employee** (lines 215-217) — When an org-level KPI is encountered, check if a matching filled value exists in the lookup Set. Increment `orgLevelFilledKpis` accordingly.

4. **Update the badge display** (lines 606-612) — Change from showing just `{emp.orgLevelKpis}` to showing `{emp.orgLevelFilledKpis}/{emp.orgLevelKpis}` with color coding:
   - Green text when all filled (`filledCount === totalCount`)
   - Amber/default when partially filled
   - Current style when none filled

