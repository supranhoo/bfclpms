# Fix: KPI Weightage Dashboard cross-fiscal overlap (Jul/Aug pulling next-FY data, Sep silently overwritten)

## Confirmation
Confirmed — the overlap you're seeing is a bug, not correct behaviour. Verified in the DB for Piyush Bansal (AY 2025-26, KRA "Balance Sheet finalization"):

| Column shown | Real source row | Correct fiscal? |
|---|---|---|
| JUL 16% | `review_year=2026, review_period=July` | ❌ belongs to FY 2026-27 |
| AUG 16% | `review_year=2026, review_period=August` | ❌ belongs to FY 2026-27 |
| SEP 16% | `review_year=2026, review_period=September` **overwrote** `review_year=2025, review_period=September = 20%` | ❌ wrong row wins |
| OCT–DEC 20% | `review_year=2025, review_period=Oct/Nov/Dec` | ✅ |
| JAN–MAR 20% | `review_year=2026, review_period=Jan/Feb/Mar` | ✅ |
| APR–JUN 16% | `review_year=2026, review_period=Apr/May/Jun` | ✅ (real variance) |

So the *legitimate* variance in AY 2025-26 is only Apr–Jun. Jul/Aug are phantom rows from the next fiscal year, and Sep is a silent overwrite of the correct value.

## Root Cause (verified)
`src/hooks/useKpiWeightageMatrix.ts → fetchYear` and `public.rpc_weightage_variance_summary` / `rpc_weightage_eligible_employees` both fetch KPIs by `review_year IN (fiscalStartYear, fiscalStartYear+1)` with **no month filter**. Aggregation keys by month name only, so:
- Jan–Jun of `fiscalStartYear` (belongs to the *previous* fiscal year) leaks in.
- Jul–Dec of `fiscalStartYear+1` (belongs to the *next* fiscal year) leaks in.
- Whichever half happens to be inserted last silently overwrites the correct month for the current fiscal.

The fiscal cycle is Jul→Jun (per `mem://architecture/pms/fiscal-year-cycle`), but the eligibility/summary contract does not encode "first half = year N (Jul–Dec), second half = year N+1 (Jan–Jun)".

## Fixed Requirement (to be enforced)
For a fiscal window whose start year is **Y**:
- Row is in-scope **iff** `(review_year = Y AND review_period IN ('July'..'December'))` OR `(review_year = Y+1 AND review_period IN ('January'..'June'))`.
- Any other `(review_year, review_period)` combination is out of scope and MUST NOT appear in the matrix, in the variance count, or in the eligibility set.

## Risk & Impact Report
- **Data impact:** none. Read-only fixes. No historical rows changed. Baseline/variance calculations already look at whatever rows are returned, so once the wrong rows are excluded, "Variances" count drops naturally (correctly) for anyone whose only "mismatch" was a phantom next-FY row.
- **Workflow impact:** none — no writes, no RLS change.
- **UI/UX:** Piyush's row will show Jul/Aug empty (or `—`), Sep = 20%, and only Apr/May/Jun 16% will remain flagged red. The employee-level pill count and the global "N Variances" badge will decrease accordingly.
- **Regression risk:** low. Only two call sites: `useKpiWeightageMatrix` and `useWeightageVarianceSummary` (both DB-side RPCs). Both changes are additive predicates. Existing tests in `src/test/kpiWeightageDashboardPagination.test.ts` still pass because the eligibility contract narrows, not widens.
- **Scalability:** predicate is index-friendly (`review_year`, `review_period` are on `kpis`). Reduces rows fetched — small perf win.
- **Rollback:** revert the hook edit + drop the new migration (functions are `CREATE OR REPLACE`, safe).

## Plan (surgical)

1. **`src/hooks/useKpiWeightageMatrix.ts`**
   - Define `FIRST_HALF_MONTHS = ['July'..'December']` and `SECOND_HALF_MONTHS = ['January'..'June']`.
   - `fetchYear(fiscalStartYear, FIRST_HALF_MONTHS)` → adds `.in('review_period', FIRST_HALF_MONTHS)`.
   - `fetchYear(fiscalStartYear + 1, SECOND_HALF_MONTHS)` → adds `.in('review_period', SECOND_HALF_MONTHS)`.
   - No other changes; month-key aggregation is now safe because no month name can arrive from two calendar years.

2. **New migration** — redefine both RPCs (`CREATE OR REPLACE`, keeps signatures/grants):
   ```sql
   AND (
     (k.review_year = p_fiscal_start_year
        AND k.review_period IN ('July','August','September','October','November','December'))
     OR (k.review_year = p_fiscal_start_year + 1
        AND k.review_period IN ('January','February','March','April','May','June'))
   )
   ```
   Applied to `rpc_weightage_eligible_employees` and to the `raw` CTE in `rpc_weightage_variance_summary`. Grants unchanged (already granted to `authenticated`, `admin`-gated inside).

3. **Tests**
   - New `src/test/kpiWeightageFiscalWindow.test.ts` — mocks Supabase and asserts:
     - `fetchYear(2025)` request carries `review_period IN (Jul..Dec)`.
     - `fetchYear(2026)` request carries `review_period IN (Jan..Jun)`.
     - Rows from disallowed `(year, month)` pairs are never merged into `emp.months`.
   - Extend `src/test/kpiWeightageDashboardPagination.test.ts` with a scenario mirroring Piyush's data (2025-Sep=20 + 2026-Sep=16 + 2026-Jul=16) → matrix shows Sep=20 and Jul empty; variance count = 0 for that KPI (Apr–Jun rows omitted here).

4. **`POLICY.md`** — add the requirement above under §4 (KPI Weightage Governance) and reference `mem://architecture/pms/fiscal-year-cycle`.

5. **`DOCUMENTATION.md`** — add a `v2.66.73 (2026-07-04 — KPI Weightage Dashboard cross-fiscal overlap fix / ADR)` changelog entry with RCA + fix + regression guards, matching the format already used at the bottom of the file.

6. **`mem://architecture/pms/fiscal-year-cycle`** — append a one-liner: *"For any fiscal-year-scoped query over `public.kpis`, filter both `review_year` and `review_period` in tandem: (Y, Jul–Dec) ∪ (Y+1, Jan–Jun). Filtering by `review_year` alone leaks the sibling halves of the adjacent fiscal years."*

## UI Changes
- **Where:** Admin → KPI Weightage Dashboard, employee rows.
- **What visually:** for AY 2025-26, JUL and AUG columns for KPIs mapped only from Sep 2025 onward will now render `—` (empty) instead of the wrong 16%. SEP will show the correct value from `review_year=2025` (e.g. Piyush BS finalization = 20%). The red "Variance" pill and the global `N Variances` badge will decrease as phantom variances disappear.
- **Interaction impact:** none — filters, edits, acknowledgements, export continue to work.
- **Responsiveness:** unchanged.

## Post-implementation notes
- The "employees with no KPI in the current fiscal window" list will shrink (correctly): anyone whose only mappings are Jan–Jun of Y or Jul–Dec of Y+1 will drop out — they belong to a different AY.
- If existing Excel exports were shared with stakeholders showing the phantom Jul/Aug values, they were incorrect; the fix produces the authoritative view.
