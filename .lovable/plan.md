## Goal
Speed up the KPI Weightage Dashboard by paginating employees instead of loading the entire org's fiscal-year KPI set in one shot.

## Problem
`useKpiWeightageMatrix` fetches every KPI row for both halves of the fiscal year (paged by 1000) for **all** employees, then filters client-side by department / search / inactive. With hundreds of employees × ~12 months × multiple KPIs, this is thousands of rows shipped on every load, plus heavy post-processing. The page also renders every employee section at once.

## Approach
Two-step query, employee-paginated:

1. **Step 1 — Paginated employee list (fast, server-side filtered).**
   Query `profiles` directly with the employee/department/active filters and `.range(from, to)` + `count: 'exact'`. Default page size 25 (options 25 / 50 / 100). This gives a stable page of employees and a total count immediately.

2. **Step 2 — KPI matrix for that page only.**
   Once the page's employee IDs are known, fetch KPIs scoped via `.in('employee_id', pageIds)` for both fiscal halves (still parallelised, still paged at 1000 internally as a safety net but practically one round-trip per half). Apply the category filter server-side. Build the matrix exactly as today but for ≤100 employees.

3. **Manual-fetch ergonomics.**
   - Initial mount: render filter bar + employee count placeholder, no fetch (consistent with §113 spirit, but we keep auto-load on first paint here because admins expect this dashboard to land with data — we just constrain it to the first page). Decision: **auto-load page 1**, do not require an explicit Search click; the existing filter inputs already live-update via React state and feel like a dashboard, not a list screen. We add debounced submission only for the free-text employee search (300 ms) so typing doesn't thrash queries.
   - Filter changes (year / department / category / inactive / search) reset to page 1.
   - Add a pagination footer below the employee list with Prev / Next, page indicator (`Page X of Y · N employees`), and a page-size `Select` (25 / 50 / 100).

4. **Variance / acknowledged badges.**
   Today's badges count only the loaded employees, which currently means the whole org. After pagination they would only reflect the visible page, which is misleading. Add a lightweight aggregate count query (single SQL aggregation against `kpis` filtered by `review_year in (Y, Y+1)` plus the same employee/department/category filters) that returns `{ varianceCount, acknowledgedCount, totalEmployees }` for the full filter set, independent of pagination. Cached separately from the matrix.

## Files to change
- `src/hooks/useKpiWeightageMatrix.ts` — split into:
  - `useEmployeeMatrixPage(fiscalYear, filters, page, pageSize)` — returns `{ employees, globalActiveMonths, total }`, only for the page's employees.
  - `useWeightageVarianceSummary(fiscalYear, filters)` — full-filter aggregate counts, debounced and cached.
- `src/pages/admin/KpiWeightageDashboard.tsx` — wire pagination state (`page`, `pageSize`), debounce `employeeSearch`, render pagination footer, swap badge source to the summary hook, reset page on filter changes.
- `src/test/kpiWeightageDashboardPagination.test.ts` (new) — pure-logic tests:
  - page resets to 1 on filter change
  - page-size change resets page
  - search debounce fires once for rapid typing
  - employee fetch uses `.range(from, to)` and KPI fetch uses `.in('employee_id', ids)`
- `DOCUMENTATION.md` — add subsection under KPI Weightage Dashboard noting the pagination contract and that aggregate badges reflect the full filter set (not the page).
- `POLICY.md` — add a one-paragraph note: admin matrix dashboards must paginate the outer dimension (employees) and aggregate-count badges must be filter-scoped, not page-scoped.
- `mem/features/admin/kpi-weightage-dashboard.md` — update with pagination behaviour.

## Risk & Impact
- **Data Impact**: None. Read-only. No schema, RLS, or migration changes. Existing inline edit / acknowledge / add-KPI flows continue to invalidate `['kpi-weightage-matrix']`; we keep that key prefix so invalidations still work.
- **Workflow Impact**: None — admins still see the same screen, just paginated. Export currently exports `employees` from the hook; we'll preserve current behaviour by exporting **only the current page** and adding a small note. (If the user wants whole-filter export later, that's a follow-up using the aggregate query.)
- **UI/UX Consistency**: Pagination footer matches existing Safety table primitives (`SAFETY_PAGE_SIZE_OPTIONS = [25, 50, 100]`). Visual hierarchy unchanged.
- **Regression Risk**: Medium-low. Two known sharp edges:
  1. Variance/acknowledged badges previously summed the entire org because the hook loaded everything; we explicitly fix this with the aggregate query so numbers don't silently change meaning.
  2. Expand/Collapse All only affects the current page now — acceptable and matches the paginated mental model.
- **Mitigation**: Unit tests above; manual verification on /admin/kpi-weightage-dashboard with multi-page data; keep query key prefix stable so existing invalidations elsewhere still work.

## Out of scope
- Server-side joins for global export across all pages (call out in docs as a follow-up if needed).
- Refactoring this dashboard to the strict `useManualQuery` filters-first contract — that's a Safety-module rule; this admin dashboard keeps auto-load page 1 to preserve the current admin UX.