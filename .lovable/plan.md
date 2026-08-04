# Why calibrations don't show in the Annual Review Report — and the fix (ADR-244)

## What is verified

- 27 calibrations exist, all on the single open cycle **Annual Review - 2025-2026** (23 of them CPP/45 MW from 1 Aug). Data is intact.
- RLS on `annual_review_calibrations` allows admin (and HR/management/named reviewers) to read them — access is not the blocker.
- That cycle has **2,589 instances**.
- `useAnnualReviewCalibrations(instanceIds)` builds a single `.in('instance_id', ids)` GET request from the ids passed in.
- Detail tab (`pages/reports/AnnualReviewReport.tsx` line 82) passes only the **current page** of rows (25). With 27 calibrated employees spread over 2,589 rows, a given page almost never contains one — so the `Cal` badge and the Calibrated Rating / Calibration Reason columns look permanently empty, and the page-scoped Excel export writes blanks.
- Comprehensive tab (`ComprehensiveTab.tsx` line 116) passes **all 2,589 ids** into the same `.in(...)`, producing a request URL of roughly 100 KB — far past what PostgREST/the gateway accepts. The query errors and the hook falls back to `{}`, so every row renders as uncalibrated and the main workbook emits raw ratings.

The Comprehensive-tab failure is the one to confirm on-screen before shipping: open the tab as admin and check the network/console for the failing `annual_review_calibrations` request. Step 1 does exactly that.

## Risk & impact

- Data: read-only. No schema, RPC, RLS or stored-score change.
- Workflow: none. Increment decisions taken off the report stop disagreeing with the Bell Curve.
- UI: same columns and badges; they now carry values for the 27 calibrated employees.
- Regression: Bell Curve untouched (it already loads calibrations per cycle). Rating distribution and slab % on Comprehensive shift for calibrated rows — the intended correction.
- Scale: one cycle-scoped query returning ~27 rows replaces a 2,589-id URL. Strictly cheaper.

## Plan

1. **Verify** — load the report's Comprehensive tab as admin and capture the failing calibrations request (URL length / status).
2. **Cycle-scoped hook** — add `useAnnualReviewCycleCalibrations(cycleId)` to `src/hooks/useAnnualReviewCalibrations.ts`: calibrations joined to that cycle's instances, keyed by `instance_id`, same `CalibrationRecord` shape. Keep the id-based hook for genuinely small sets (single-instance detail page).
3. **Comprehensive tab** — swap line 116 to the cycle-scoped hook. `resolveReportRating` and `ratingCtx` are unchanged, so grid, drill-down cards, `Cal`/`Capped` badges, the rating distribution chart and `ComprehensiveExport` pick the values up with no further edit.
4. **Detail tab** — swap line 82 to the cycle-scoped hook so calibration shows on whatever page the employee lands on, and the page export carries the calibrated value.
5. **Guard against silent empties** — surface the hook's `error` as a one-line inline warning on both tabs ("Calibration data could not be loaded — ratings shown are uncalibrated") instead of degrading silently to `{}`. That silent degrade is the real defect class here.

## Tests

- `src/test/annualReview/reportRating.test.ts` — add a case asserting a calibrated row renders the calibrated rating and its slab.
- New test that the calibration context loader is cycle-scoped (never receives a per-row id list), so the URL-length failure cannot return.

## Docs

ADR-244 (calibration context must be cycle-scoped, never id-list-scoped), POLICY §AR-REPORT-EFFECTIVE-OUTCOME addendum, DOCUMENTATION.md version entry, and an update to the annual-review effective-outcome memory.

## Rollback

Presentation-only; reverting the two hook call sites restores current behaviour. No data is written.