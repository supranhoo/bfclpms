---
name: Bell Curve Analysis
description: Annual Review Report bell curve tab — banding, configurable targets, compliance thresholds, manager scoping
type: feature
---
ADR-218 / POLICY §AR-BELL-CURVE.
- Ratings come from `toRatingOutOf5(total_score)` (ADR-212). Band = nearest integer clamped 1..5.
- Denominator = non-excluded, rated employees only.
- Targets + green/amber thresholds are master data in `annual_review_bell_curve_config` (global row + optional cycle override). Never hardcode percentages.
- Engine SSOT: `src/lib/annualReview/bellCurve.ts`. UI: `src/components/reports/annual-review/BellCurveTab.tsx` (+ `bellCurve/` subcomponents).
- Managers/skip-level see only their reporting line; targets stay org-level.
- Bell Curve Excel/PDF exports are tab-local; the report's main download is unchanged.
- ADR-218b: **Band mode** switch — *Rating bands (1–5)* (default) or *Slab %* (ADR-212 increment slabs). Slab bands have NO targets: hide target/variance/compliance, normalization card and the target curve; never render 0.
- Mode-agnostic engine API: `makeBanding(mode, config, slabs)` + `computeBands` / `summarize` / `groupBands` / `heatmapBands` (`DistRow`). Legacy rating helpers are wrappers — keep rating output identical.
