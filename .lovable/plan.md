## Goal
Add a **"Monthly KRA Scores"** sheet to the Annual Review comprehensive report export, listing the July→June monthly KPI performance for every employee whose annual-review template is KRA-driven (has a `carry_kra` system slot).

## Assumptions
- Fiscal year is July→June, anchored on the cycle's `review_year` (matching `carryKraScore.ts`).
- Monthly value = weighted KPI average using the existing authority chain (final → auditor → manager → self), excluding `is_na` rows — identical maths to `compute_carry_kra_contribution`, so the sheet reconciles with the KRA points already in the report.
- Sheet is export-only (Excel). No UI tab is added.

## Risk & Impact Report
- **Data impact**: read-only. One new `SECURITY DEFINER STABLE` RPC; no schema or RLS change to existing tables.
- **Workflow impact**: none. Export button behaviour unchanged apart from one extra sheet.
- **UI/UX impact**: none visually; export takes marginally longer (one extra RPC round-trip).
- **Regression risk**: low. New sheet is appended; existing sheet builders untouched. Risk is query cost on `kpis`/`review_submissions`.
- **Scalability**: a per-employee client loop (`fetchMonthlyKraScores`) would be hundreds of round-trips and time out. Mitigated by one **set-based server-side RPC** that aggregates all employees in a single pass, plus a client-side row cap.
- **Mitigation**: RPC restricted to admin/hr_pms/management (same audience as the report); indexed filter on `kpis.employee_id + review_year`; batched employee-id input (chunks of 500) to keep payloads bounded.
- **Rollback**: drop the RPC and remove the sheet append — no data written.

## Steps

1. **Migration — bulk monthly aggregation RPC**
   `get_annual_review_monthly_kra_matrix(p_employee_ids uuid[], p_fy_start int, p_exclude_na boolean default true)`
   returns `(employee_id, review_period, review_year, avg_rating numeric, achieved numeric, out_of numeric, pct numeric, kpi_count int)`.
   - Set-based `GROUP BY` over `kpis` joined laterally to `review_submissions`, filtered to the 12 fiscal months of `p_fy_start`.
   - Guard: `has_role(auth.uid(),'admin'|'hr_pms'|'management')`, else `42501`.
   - `GRANT EXECUTE ... TO authenticated`.
   - *Verification*: run against a known KRA employee and confirm the derived KRA points match the value already stored in that instance's `system_scores`.

2. **Service — `src/services/annualReview/monthlyKraSheet.ts`**
   - `fetchMonthlyKraMatrix(employeeIds, fyStart)` — chunks ids (500/call), calls the RPC, returns `Map<employeeId, Record<FyMonth, {rating, pct, count}>>`.
   - `buildMonthlyKraRows(rows, matrix, templateIsKraById)` — **pure**, testable: emits one row per KRA employee.
   - *Verification*: unit test asserts header order, blank months, and FY month ordering.

3. **Export — `ComprehensiveExport.ts`**
   - Determine KRA employees: templates carrying a `carry_kra` slot (reuse `isKraBasedTemplate`; template sections are already fetched by `fetchTemplateLabelMaps` — extend that fetch to expose `system_scores` sources rather than adding a new query).
   - Append sheet `Monthly KRA Scores` after `Employees`, skipped entirely when there are no KRA employees.
   - Columns: `Employee Code | Name | Department | Business Unit | Template | Jul /5 | Jul % | Aug /5 | Aug % | … | Jun /5 | Jun % | Months Scored | Avg /5 | KRA Points | KRA Weight`.
   - `Avg /5` = mean of non-null months (mirrors `computeCarryRating`); `KRA Points`/`KRA Weight` reuse the values already on `ComprehensiveRow`.

4. **Tests — `src/test/annualReview/monthlyKraSheet.test.ts`**
   - Header shape and 24 month columns; non-KRA rows excluded; month with no data → blank not `0`; `is_na` excluded; `Avg /5` ignores blank months; empty input → sheet omitted.

5. **Docs & policy**
   - New ADR **ADR-188 — Monthly KRA detail sheet**; `POLICY §RPT-MONTHLY-KRA-SHEET` (definition of the monthly value and its parity with the carry-KRA SSOT); `DOCUMENTATION.md` version history; memory note under `mem/features/reports/`.

## Technical notes
- The monthly rating is intentionally the **same aggregation** used by `compute_carry_kra_contribution`; if the two ever diverge the sheet would contradict the KRA Points column, so the RPC is written as the shared set-based form of that logic and the parity check in Step 1 is a hard gate.
- Client cap: if KRA employees exceed 5,000, the sheet is truncated with a clear warning toast (consistent with existing export caps).
