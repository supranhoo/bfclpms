---
name: Annual Review Report — effective outcome parity
description: ADR-230 SSOT for showing calibrated ratings and post-exemption slab % on every Annual Review report surface (Comprehensive tab, workbook, distribution chart)
type: feature
---
ADR-230 / POLICY §AR-REPORT-EFFECTIVE-OUTCOME.
- SSOT: `src/lib/annualReview/reportRating.ts` — `resolveReportRating(row, ctx)` returns computed vs effective rating, calibration reason, eligibility status, raw vs effective slab %, `capApplied`. Composes `effectiveRating` (ADR-220), `resolveEligibility` (ADR-221) and `effectiveSlabPercent` (ADR-222/224); never re-implement them.
- NEVER derive a displayed rating/slab from `total_score` via `toRatingOutOf5`/`resolveSlabPercent` on a report surface — that was the ADR-230 defect.
- Penalty rule is assembled ONLY by `buildSlabCapOptions(bellCurveConfig, slabs)`. Inline `SlabCapOptions` literals drop ADR-224 fields (mode/scope/floor/top-slab window) — forbidden.
- Consumers: `ComprehensiveTab.tsx` (grid + drill-down + `Cal`/`Capped` badges), `ComprehensiveExport.ts` (`ratingContext` optional; omitted = legacy workbook), `RatingDistributionChart` (`ratingLabelOf`), Detail tab in `pages/reports/AnnualReviewReport.tsx`.
- Workbook audit columns: `Computed Rating (/5)`, `Calibrated Rating`, `Calibration Reason`, `Raw Slab %`, `Exemption Cap Applied`, `Eligibility Status`. Executive Summary carries the penalty rule.
- Eligibility questions resolve against `template_override_id ?? template_id` (ADR-117).
- DB values (`total_score`, `final_rating`) stay raw — this is presentation only.
- Guard: `src/test/annualReview/reportRating.test.ts`.
