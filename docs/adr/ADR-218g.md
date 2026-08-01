# ADR-218g — Bell Curve replaces the Annual Review Admin "Analytics" tab

Date: 2026-08-01
Status: Accepted

## Context
The Annual Review Admin "Analytics" tab rendered three hand-rolled aggregates
(stage funnel, rating counts, a locally recomputed blended-score histogram and
an on-time card). It duplicated distribution analysis that ADR-218/218a–f
already provide from the ADR-212 SSOT, and it recomputed blends client-side.

## Decision
1. The `analytics` tab is removed; a `bell-curve` tab takes its place (same
   position, `BarChart3` icon, label "Bell Curve").
2. It mounts `BellCurveTab` — the exact component used by the Annual Review
   Report — scoped to the active cycle. One component, two mount points, so no
   Bell Curve capability is lost or forked (band modes, KRA filter, eligibility
   /exemptions, heat map drill-down, calibration, form viewer, tab-local
   Excel/PDF exports).
3. Empty state when no cycle is active.

## Consequences
- Presentation only: no schema, RPC, RLS, service or engine change.
- Dead code removed: `AnalyticsTab`, `STAGE_ORDER`/`STAGE_LABEL`, recharts imports.
- Rollback: restore `AnalyticsTab` and the old trigger/content pair.

## Guards
Existing `src/test/annualReview/bellCurve*.test.ts` continue to guard the engine.
POLICY §AR-BELL-CURVE (Admin mount note).
