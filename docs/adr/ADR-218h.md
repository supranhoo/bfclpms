# ADR-218h — Calibration tab removed from Annual Review Admin

Date: 2026-08-01
Status: Accepted

## Context
The Annual Review Admin "Calibration" tab offered a free-text `final_rating`
override (`useOverrideRating`) plus a hand-rolled count of `final_rating`
strings. ADR-220 introduced the real calibration path — numeric /5 override in
`annual_review_calibrations` via admin-gated SECURITY DEFINER RPCs — surfaced
from the Bell Curve heat map drill-down. Two competing calibration surfaces is
a correctness risk: the legacy tab bypasses the override table and the
effective-rating engine used by every band, slab and export.

## Decision
1. The `calibration` tab trigger, its `TabsContent` and the `CalibrationTab`
   component are removed from `src/pages/annual-review/AnnualReviewAdmin.tsx`.
2. Bell Curve → heat map drill-down → **Calibrate** (ADR-220) is the single
   calibration entry point; bulk calibration stays there too.
3. The distribution card is superseded by the Bell Curve tab (ADR-218g), which
   reads the ADR-212 SSOT with targets, variance, compliance and drill-down.
4. `useOverrideRating` in `src/hooks/useAnnualReview.ts` is retained but
   **deprecated** — no UI may mount it.

## Consequences
- Presentation only: no schema, RPC, RLS, service or engine change.
- Deep links with `?tab=calibration` fall back to the default Progress tab.
- Rollback: restore the trigger/content pair and the `CalibrationTab` function.

## Guards
POLICY §AR-BELL-CURVE item 13. Existing ADR-220 calibration tests and
`src/test/annualReview/bellCurve*.test.ts` continue to guard the engine.
