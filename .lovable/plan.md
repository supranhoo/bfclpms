
## Assumptions
- Programme "Metal Sizing" is production-type for June 2026.
- Data Entry Grid shows **Grand Total ₹3,98,134** across **280 employees** (filtered roster).
- Incentive Report Preview shows **201 records / ₹3,10,983**, with diagnostics: *In scope 292 · With daily 1000 · With rate 175 · Skipped (no rate) 0*.
- The "1000" in *With daily data* is the smoking gun — PostgREST silently capped the daily-entries fetch.

## Risk & Impact Report
- **Data Impact**: Silent truncation has been mis-computing production incentives for any programme whose `production_daily_entries` for a month exceed 1000 rows. Stored `employee_incentive_records` for those months are incomplete and have been since the function was written. Existing rows are correct in value but missing for affected employees.
- **Workflow Impact**: Finalise / Mark Paid currently understates payouts for production programmes — payroll risk.
- **UI Impact**: Dialog and Report counts/totals change after fix (will increase to match Data Entry).
- **Regression Risk**: Low — adds pagination, no logic change. Same pattern already used at lines 67 and 258 of the same file for other tables (RCA 2026-05-29 for `profiles`).
- **Scalability Impact**: Switches three currently-capped reads to paginated loops; bounded by employees-in-scope.
- **Mitigation**: Unit test that simulates >1000 daily-entry rows and asserts all are loaded; diagnostic counter renamed/clarified.

## Root Cause Analysis

### Five Whys
1. **Why does the Incentive Report total (₹3,10,983 / 201) differ from the Data Entry Grid (₹3,98,134 / 280)?**
   The compute function processed only a subset of employees who actually had daily production data.
2. **Why was that subset smaller than the data-entry view?**
   The dialog diagnostic shows `employees_with_daily_entries = 1000` against `employees_in_scope = 292`, but more importantly the loaded `prodDailyMap` is built from a fetch that returned exactly the PostgREST default cap.
3. **Why did the fetch return only a capped slice?**
   `supabase/functions/compute-monthly-incentives/index.ts:309-314` reads `production_daily_entries` for a programme/month with **no `.range()` pagination**. PostgREST silently truncates at 1000 rows, so any employee whose row lands beyond that limit is invisible to compute — hence Pavan Gope (1050 TPD) and the missing 79 employees / ₹87,151 delta.
4. **Why was pagination missed here when other reads in the same file already paginate?**
   Lines 67 (employees) and 258 (org KPI values) were patched during the 2026-05-29 BFCL RCA, but `production_daily_entries`, `incentive_production_rates` (line 329) and the existing-records read (line 367) were not audited at that time.
5. **Why did this slip past tests and review?**
   No test exercises a programme/month with >1000 daily-entry rows; the project does not yet have a lint/grep rule for unpaginated PostgREST reads inside edge functions.

### Cause class
Recurrence of the documented "PostgREST 1000-row silent truncation" class (see comment in same file, line 358–360). Same defect, different table.

## Plan

1. **Fix the unpaginated reads in `supabase/functions/compute-monthly-incentives/index.ts`**
   - Wrap the `production_daily_entries` fetch (line 309) in a `.range()` loop until the page is short.
   - Same for `incentive_production_rates` (line 329) and `existingRecords` (line 367).
   - Use the existing pagination helper pattern at line 67 (PAGE_SIZE = 1000) — no new abstraction.
   - Keep all downstream logic identical.

2. **Tighten diagnostics so this class of bug surfaces loudly**
   - Add `daily_entries_rows_loaded` to `diagnostics` and a warning in `diagnosticMessage` when `daily_entries_rows_loaded === PAGE_SIZE` and no further page was attempted (defensive belt-and-braces).
   - Rename label in `IncentiveDryRunDialog.tsx` from "With daily data" → "Employees with daily data" so the count is unambiguous.

3. **Regression test** — `src/test/computeMonthlyIncentivesPagination.test.ts`
   - Mock a Supabase client that returns 1000 rows on first call, 250 on second; assert the function consumes both pages and `prodDailyMap.size === 1250`.
   - Negative test: single page <1000 rows stops after first call (no infinite loop).

4. **Operational repair (Confirm & Compute re-run, no code)**
   - After deploy, the user re-runs **Confirm & Compute** for Metal Sizing / June 2026. The compute function already deletes-then-upserts in the affected period, so the missing 79 records will be created on the next run; existing correct records are overwritten with the same values.
   - No migration, no manual SQL.

5. **Documentation & policy sync**
   - **ADR-094** — "Edge function reads must paginate; PostgREST 1000-row cap class".
   - **`mem/architecture/safety/manual-fetch-and-pagination.md`** — append `compute-monthly-incentives` to the audited list.
   - **`POLICY.md`** — add a one-line rule: *Every Supabase read in an edge function that can exceed 1000 rows MUST paginate via the `.range()` loop helper.*
   - **`DOCUMENTATION.md`** — Version History entry referencing ADR-094 and this RCA.

## CAPA

### Corrective
- C1. Paginate the three reads in `compute-monthly-incentives` (step 1).
- C2. Re-run Confirm & Compute for Metal Sizing / June 2026 (step 4) — restores the missing 79 records and brings the Report total to ₹3,98,134.
- C3. Clarify diagnostic label (step 2) so the symptom is unambiguous next time.

### Preventive
- P1. Add a repo grep test under `src/test/` that fails the build when any file under `supabase/functions/**` calls `.select(` without a downstream `.range(` or comment marker — pattern lifted from existing SSOT lock tests (`incentiveReportCompanyFilterSsot.test.ts`).
- P2. Audit and patch any sibling edge functions (`compute-increment`, `bulk-review-auto-revert`, etc.) flagged by P1 — captured as follow-up tickets, not in this change.
- P3. Memory rule pinned in `mem/architecture/safety/manual-fetch-and-pagination.md` so future generations apply the rule automatically.

## Files
- **Edit**: `supabase/functions/compute-monthly-incentives/index.ts`, `src/components/incentive/IncentiveDryRunDialog.tsx`, `POLICY.md`, `DOCUMENTATION.md`, `mem/architecture/safety/manual-fetch-and-pagination.md`, `mem/index.md`.
- **Add**: `docs/adr/ADR-094.md`, `src/test/computeMonthlyIncentivesPagination.test.ts`, `mem/features/incentive/compute-pagination-fix.md`.
- **No DB migration. No schema or RLS change. No UI redesign.**

## Rollback
Revert the edge-function file to the previous version and redeploy; the only behavioural change is read-pagination. No data is destroyed by the fix (compute is delete-then-upsert within the period being recomputed).
