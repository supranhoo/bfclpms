# Remove the Calibration tab from Annual Review Admin

## What changes for the user

- The **Calibration** tab disappears from the Annual Review Admin tab bar (between "Bell Curve" and "Cycles").
- Rating calibration continues to be done from **Bell Curve → heat map drill-down → Calibrate** (ADR-220), which is admin-gated, reason-required and audit-logged.
- No other tab moves; the Bell Curve tab stays where it is.

## Why the legacy tab can go

The legacy tab used the free-text `final_rating` override (`useOverrideRating`), a separate and older path from the ADR-220 calibration service (`admin_calibrate_final_rating`) now surfaced in Bell Curve. Its rating-distribution card is a plain count of `final_rating` strings; the Bell Curve tab renders the same distribution from the ADR-212 SSOT with targets, variance, compliance and drill-down. Nothing unique is lost.

## Technical detail

- `src/pages/annual-review/AnnualReviewAdmin.tsx`
  - Remove the `calibration` `TabsTrigger` (line 130) and its `TabsContent` (line 144).
  - Delete the `CalibrationTab` component (lines 2358-2489).
  - Drop the now-unused `useOverrideRating` import; keep `Scale` (still used by System KPIs and weights UI). Remove any other imports left unused by the deletion (checked by typecheck/lint).
  - Any deep link with `?tab=calibration` falls back to the default tab.
- `src/hooks/useAnnualReview.ts`: `useOverrideRating` becomes unreferenced. Keep the hook (harmless, and the underlying RPC stays) or remove it — plan is to **keep** it to avoid touching the hooks module; note it as deprecated in the ADR.
- No schema, RPC, RLS or service change. Presentation only.

## Risk

- Data impact: none.
- Workflow impact: admins must use Bell Curve → Calibrate; that path already exists and is stricter (numeric /5 rating, reason mandatory, override table + audit).
- Regression risk: low — single-file deletion of a self-contained component.
- Rollback: restore the trigger/content pair and the `CalibrationTab` function.

## Docs

- New `docs/adr/ADR-218h.md` — Calibration tab removed, ADR-220 Bell Curve calibration is the single entry point.
- `POLICY.md` §AR-BELL-CURVE / §AR-CALIBRATION: note the single calibration surface.
- Memory update on `mem://features/reports/bell-curve-analysis`.
