# BUG-038 — "Export Current Data" Statement Timeout (PMS Scorecard Import)

## Symptom
On `/admin/import` → **Import PMS Data** tab, clicking **Export Current Data** shows:
> Export Failed — canceling statement due to statement timeout

## Root Cause Analysis
`exportKpiData()` in `src/pages/admin/ImportData.tsx` (line 1749) makes paginated calls but each call is **expensive enough to hit Postgres' statement timeout** (~8s on PostgREST):

1. **Heavy nested join on `kpis`** — every page pulls a 4-level join:
   `kra_categories(name), profiles!kpis_employee_id_fkey(employee_code, full_name, department_id, departments(name, business_units(name, divisions(name))))`
   With **9,526 KPIs**, the planner serializes this for each 1000-row page.
2. **No `ORDER BY`** on `.range()` — PostgREST/Postgres cannot use a stable index scan; it materialises the full set repeatedly. This is the proximate cause of the timeout (`canceling statement due to statement timeout`).
3. **`review_submissions` page is also unordered** (7,550 rows) — currently fine but at risk.
4. `performance_reviews` returns 0 rows; not a concern.

The 1st page itself (1000 KPIs × 4-level join, unordered) exceeds the timeout → entire export aborts.

## Fix Plan

### 1. Decouple the heavy joins from the paginated KPI fetch
Fetch `kpis` with **only its own columns** (no nested joins), then resolve `kra_categories`, `profiles`, `departments`, `business_units`, `divisions`, and `sub_branches` in a few lookup queries using `.in('id', [...])`. This is the same pattern already used in `IncentiveDataExport.tsx`.

### 2. Add stable `ORDER BY` + paginate via `fetchAllPaged`
Replace the manual `while(true)` loops with `fetchAllPaged()` from `src/lib/fetchAll.ts` (already mandated by `mem://architecture/profiles-query-policy`), and add `.order('id')` to every paginated query so each range scan is index-backed and bounded.

### 3. Reduce page size for the KPI query
Drop from 1000 → 500 rows per page to stay comfortably under the statement timeout even on cold caches.

### 4. Apply the same pattern to `exportEmployeeData` (defensive)
The employee export uses similar joins; add ordering + `fetchAllPaged` to prevent the same regression as the roster grows.

### 5. Regression test
Add **BUG-038** to `src/test/bugBountyFixes.test.ts` asserting:
- Paginated queries include `.order(...)` before `.range(...)`.
- Lookup tables (`profiles`, `departments`, `business_units`, `divisions`, `kra_categories`, `sub_branches`) are fetched as separate `.in('id', [...])` queries, not nested in the main KPI select.

### 6. Docs & memory
- `DOCUMENTATION.md`: add v2.66.7.39 changelog entry.
- `POLICY.md` §94 (profiles paging): extend to "any export over a large table must use lookup-decoupled fetches with ordered pagination".
- New memory: `mem/architecture/database/large-export-pagination-policy` — codify the pattern.

## Risk & Impact
- **Data Impact**: None. Read-only; output Excel structure unchanged.
- **Workflow Impact**: None. Same button, same file, just succeeds.
- **UI/UX**: Identical UI; export now completes in one pass.
- **Regression Risk**: Low — the join decoupling is a behaviour-preserving refactor. Existing column mapping is kept verbatim.
- **Mitigation**: New unit test + manual verification on the 9,526-KPI dataset.

## Files to Edit
- `src/pages/admin/ImportData.tsx` — refactor `exportKpiData`, harden `exportEmployeeData`.
- `src/test/bugBountyFixes.test.ts` — add BUG-038 suite.
- `DOCUMENTATION.md`, `POLICY.md`, `mem/index.md`, and new `mem/architecture/database/large-export-pagination-policy`.
