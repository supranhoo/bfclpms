## Goal
Add one column to the **Employees** sheet of the Annual Review comprehensive export showing how many fiscal months of KRA data produced the employee's KRA-derived score.

## Assumptions
- Column name: `KRA Months Counted`, placed next to the existing `KRA Points` / `KRA Weight` columns.
- Value = the same `Months Scored` count already computed for the "Monthly KRA Scores" sheet (count of July→June months with at least one scored, non-`is_na` KPI).
- Non-KRA employees get a **blank** cell (not `0`), consistent with ADR-188's "blank ≠ zero" rule.
- If the monthly RPC fails or the cycle id is missing, the column is emitted blank — the workbook still downloads (fail-soft parity with the KRA sheet).

## Risk & Impact Report
- **Data impact**: none. Read-only, reuses the existing `get_annual_review_monthly_kra_matrix` RPC. No schema, RLS or migration change.
- **Workflow impact**: none.
- **UI/UX impact**: Employees sheet gains one column after `KRA Points`; no on-screen UI change.
- **Regression risk**: low, but non-zero — the KRA matrix currently loads *after* the Employees sheet is built, so the export flow must be reordered to fetch it once and share it. Mitigated by keeping the fetch in a single `Promise` resolved before both sheets and leaving `buildMonthlyKraRows` untouched.
- **Scalability**: no extra round-trips — the same batched (500 ids/call) matrix now serves both sheets instead of being fetched for the KRA sheet alone.
- **Rollback**: remove the column and restore the original call order.

## Steps

1. **`src/services/annualReview/monthlyKraSheet.ts`**
   - Export a small pure helper `monthsScored(matrix, employeeId): number | null` — returns the count of months with a non-null rating, or `null` when the employee is absent from the matrix.
   - No change to `buildMonthlyKraRows`; it may reuse the helper internally so both surfaces share one definition (SSOT).

2. **`src/components/reports/annual-review/ComprehensiveExport.ts`**
   - Split the current `buildMonthlyKraSheet` into: resolve KRA rows + fetch matrix once (`resolveKraContext`), then build the sheet from it.
   - Compute the context before `append('Employees', …)` and pass `{ matrix, isKraTemplate }` into `toEmployeeSheet`.
   - In `toEmployeeSheet`, add `'KRA Months Counted': isKraTemplate(r.template_id) ? (monthsScored(matrix, r.employee_id) ?? 0) : ''` immediately after `'KRA Points'`.
   - Keep the try/catch fail-soft: on error the context is empty, the column is blank and the KRA sheet is omitted as today.

3. **Tests — `src/test/annualReview/monthlyKraSheet.test.ts`**
   - `monthsScored` returns the count of scored months, `null` for an unknown employee, `0` for a present-but-empty employee.
   - Parity assertion: `monthsScored` equals the `Months Scored` cell produced by `buildMonthlyKraRows` for the same input.
   - Add an Employees-sheet test asserting the column exists, holds the count for KRA rows and is blank for non-KRA rows.

4. **Docs & policy**
   - Amend **ADR-188** (column list + the "counted months exposed on the Employees sheet" note) and **POLICY §RPT-MONTHLY-KRA-SHEET**.
   - `DOCUMENTATION.md` version history entry; update `mem/features/reports/monthly-kra-sheet.md`.

## Technical notes
The count must not be recomputed from `kra_points`/`kra_weight` — those are a submission-time snapshot, while the month count reflects live monthly data. Deriving both the sheet and the column from the one matrix keeps them from ever disagreeing inside the same workbook.
