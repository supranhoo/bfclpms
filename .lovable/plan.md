# KRA / Non-KRA filter in Bell Curve Analysis

Add a "Scoring Source" filter next to the existing Business Unit / Department / Manager / Division / PMS Grade dropdowns on the Bell Curve tab, so leadership can see the distribution for employees whose final score is KRA-driven versus criteria-driven.

## Assumptions
- Filter lives on the Bell Curve tab only (front UI), same pattern as the PMS Grade filter (ADR-219). Say the word if you also want it on the Comprehensive tab.
- Options: All / With KRA / Blended / Without KRA. "Blended" stays separate rather than lumped into KRA, because those employees carry both criteria and KRA weight.

## Current state (verified)
- `get_annual_review_comprehensive_report` already returns `scoring_mode` (`'With KRA' | 'Blended' | 'Without KRA'`) plus `kra_weight` / `criteria_weight`; `ComprehensiveRow` types them and the Comprehensive tab already renders `scoring_mode` as a column. No DB or RPC change is needed.
- `BellCurveTab` filters the already-paged dataset in memory; `BellCurveInput` does not yet carry `scoring_mode`.

## Changes
1. `src/lib/annualReview/bellCurve.ts` — add optional `scoring_mode?: string | null` to `BellCurveInput` (filter/display field only; banding and distribution math untouched).
2. `src/components/reports/annual-review/BellCurveTab.tsx`
   - New `scoringSource` state (default `ALL`) and a "Scoring Source" `Select` appended to the filter row.
   - Options derived from the rows present in the cycle (so an empty category never shows), ordered With KRA → Blended → Without KRA.
   - Predicate applied in the same `filtered` memo as the other filters, before heat-map scoping, so KPI cards, bell curve, bar chart, variance table, heat map and tab-local exports all respect it.
3. `bellCurveExport.ts` — include the active scoring-source selection in the export filter summary line alongside the existing filters.

## UI
- Filter row gains a sixth dropdown labelled "Scoring Source", same height and styling; the row already wraps, so on narrow screens it flows to a new line.
- No layout change to the charts or heat map; only their input set narrows.

## Risk & impact
- Data: read-only, in-memory filter. No schema, RLS or RPC change.
- Regression: low — additive optional field plus one extra predicate; behaviour unchanged when the filter is "All".
- Scalability: no extra fetch; operates on the dataset the tab already loads.
- Rollback: remove the state, the dropdown and the optional type field.

## Tests & docs
- Extend `src/test/annualReview/bellCurve.test.ts` with KRA-only, non-KRA-only and blended cases (including that the distribution denominator follows the filtered set).
- Update `POLICY.md` §AR-BELL-CURVE, `DOCUMENTATION.md` version history, and add an addendum to `docs/adr/ADR-218.md`.