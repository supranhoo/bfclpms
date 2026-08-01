# Annual Review Report: make calibration + exemption changes visible everywhere

## Confirmation (verified in code)

| Surface | Calibration (ADR-220) | Eligibility / exemption penalty (ADR-221/222/224) |
|---|---|---|
| Bell Curve tab + its Excel/PDF | Yes | Yes (ADR-228 placement) |
| Detail tab + its Excel | Yes (`ratingFor`, "Calibrated Rating" / "Calibration Reason" columns, calibrate action) | Yes (`slabPercentFor`, `Exemption Cap Applied`) |
| Comprehensive tab (table + drill-down cards) | No | No |
| Comprehensive Excel export (the report's main download) | No | No |
| Rating distribution chart on Comprehensive | No | No |
| "Eligibility" column on Comprehensive | n/a | No — it prints Excluded/Eligible from `is_excluded` only; it never reads eligibility answers or exemptions |

Evidence: `ComprehensiveTab.tsx` lines 247-248 and 382-383 and `ComprehensiveExport.ts` lines 104-105 call
`toRatingOutOf5(r.total_score)` / `resolveSlabPercent(...)` directly — no calibration lookup, no
`effectiveSlabPercent`. `eligibilityLabel()` in `comprehensiveReport.ts` is `is_excluded ? 'Excluded' : 'Eligible'`.

So a calibrated or exemption-penalised employee is correct in the Bell Curve and the Detail tab, but the
Comprehensive tab and the main Excel download still show pre-calibration, pre-penalty numbers.

## Risk and impact

- Data: read-only presentation change. No schema, RPC or RLS change.
- Workflow: none. Increment decisions taken off the main export stop contradicting the Bell Curve.
- UI: added columns on the Comprehensive table; existing columns keep their headers but carry the effective
  value, with the raw value preserved in a new adjacent column so nothing is lost.
- Regression: Bell Curve and Detail tab untouched. Distribution counts on Comprehensive shift where
  calibrations/exemptions exist — that is the intended correction.
- Scale: calibrations and exemptions load once per cycle via the existing batched, cached hooks; no extra
  per-row query.

## What changes

1. Shared resolver — new `src/lib/annualReview/reportRating.ts` wrapping the existing SSOTs
   (`effectiveRating`, `resolveEligibility`, `effectiveSlabPercent`, `isSlabCapped`) into one
   `resolveReportRating(row, ctx)` returning `{ computedRating, effectiveRating, isCalibrated,
   eligibilityStatus, rawSlabPercent, slabPercent, capApplied }`. Detail tab and Comprehensive both consume
   it, so the two tabs cannot drift again.
2. ComprehensiveTab — fetch calibrations (`useAnnualReviewCalibrations`), exemptions
   (`useEligibilityExemptions`), the exemption policy and the template eligibility maps exactly as the Detail
   tab does, and feed them through the resolver. The table gains `Computed Rating (/5)` and a `Calibrated`
   badge next to `Final Rating (/5)`; `Slab %` becomes the effective percentage with a `Capped` badge when the
   exemption penalty applies. `Eligibility` becomes the resolved status
   (Eligible / Exempted / Ineligible / Excluded), with Excluded taking precedence.
3. Drill-down card — the same three values plus the calibration reason and, when exempted, the penalty rule
   applied.
4. ComprehensiveExport — accepts the same context and emits `Final Rating (out of 5)` (effective),
   `Computed Rating (/5)`, `Calibrated Rating`, `Calibration Reason`, `Slab %` (effective), `Raw Slab %`,
   `Exemption Cap Applied`, `Eligibility Status`. Existing column order is preserved; new columns sit next to
   their source.
5. Rating distribution chart and KPI summary — bucket on the effective rating so the chart agrees with the
   Bell Curve.
6. Header note — the tab and the export sheet carry the same "penalty rule in force" note the Bell Curve
   already shows.

## Tests

- `src/test/annualReview/reportRating.test.ts` — calibrated-only row, exempted-only row, both together,
  ineligible (0%), and a plain row whose output is byte-identical to today's raw values.
- Extend the ComprehensiveExport test with mock rows carrying a calibration and an exemption; assert the
  eight columns above.
- Anti-drift guard: Detail tab and Comprehensive must produce the same slab % for the same mock row.

## Docs

ADR-230 (report-wide effective rating), POLICY §AR-RATING-SLAB and §AR-ELIGIBILITY-EXEMPTION addenda,
DOCUMENTATION.md version history, and memory updates to the bell-curve and annual-review report entries.