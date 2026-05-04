---
name: KPI Weightage Dashboard
description: Employee-paginated matrix dashboard with debounced search and filter-scoped variance badges
type: feature
---

`/admin/kpi-weightage-dashboard` paginates by **employee** (POLICY §114).

Two hooks in `src/hooks/useKpiWeightageMatrix.ts`:
- `useKpiWeightageMatrix(fiscalYear, filters, { page, pageSize })` — page of employees + their KPIs only.
- `useWeightageVarianceSummary(fiscalYear, filters)` — aggregate counts across the full filter set; drives summary badges so they don't change while paging.

Rules:
- Page sizes 25/50/100 (default 25). Filter changes reset to page 1.
- Employee search is debounced 300 ms before issuing a query.
- Step 1 = filtered `profiles.range(...)` with `count:'exact'`. Step 2 = `kpis.in('employee_id', pageIds)`. No more full-org client-side filtering.
- All mutations invalidate the `['kpi-weightage-matrix']` query key prefix; variance summary uses its own key prefix.
- Excel export currently reflects the visible page only (filter-scoped export is a future enhancement).
- **Mapped-only universe**: Both hooks first resolve distinct `employee_id`s from `kpis` for the selected fiscal-year pair (and category) via `fetchEmployeesWithKpis()`, then constrain `profiles` with `.in('id', …)`. Profiles with zero KPI mappings never appear in the list, badges, or Export. POLICY §114.5.
