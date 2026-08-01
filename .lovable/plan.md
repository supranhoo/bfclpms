# Replace the Annual Review Admin "Analytics" tab with Bell Curve

## What changes for the user

- In **Annual Review Admin**, the **Analytics** tab is removed.
- In its place, a **Bell Curve** tab renders the exact same Bell Curve Analysis that exists today in the Annual Review Report — no feature is dropped:
  KPI cards, bell-curve overlay chart, actual-vs-target bar chart, variance table, group heat map with number/percentage toggle, sorting, search, multi-select, cell drill-down with the employee list (search, pagination, CSV, View form, Calibrate, Exemption actions), scoring-source (KRA) filter, band-mode switch (Rating bands / Slab %), eligibility + exemption filters, bulk exemption, target configuration dialog, and the tab-local Excel / PDF exports.
- The tab is scoped to the currently active cycle, same as every other admin tab.
- Position stays where Analytics was (second tab, after Progress), icon becomes the bell-curve chart icon.

## Why the old Analytics content can go

The existing `AnalyticsTab` shows three hand-rolled aggregates (blended-score buckets, rating counts, stage counts). The Bell Curve tab already covers distribution by rating and by slab with configurable targets, compliance and drill-down, and it reads from the ADR-212/218 SSOT rather than recomputing blends locally. Stage-count progress is already visible on the Progress tab's status cards, so nothing unique is lost.

## Technical detail

- `src/pages/annual-review/AnnualReviewAdmin.tsx`
  - Tab trigger `analytics` -> `bell-curve`, label "Bell Curve".
  - `TabsContent` renders `<BellCurveTab cycleId={activeCycle?.id} cycleName={activeCycle?.name ?? ''} />` using `useActiveCycle()` (wrapped in a small local component so the hook stays inside the tab, matching the current `AnalyticsTab` pattern). Empty state when no cycle is active.
  - Delete the `AnalyticsTab` function and any imports it alone used (`useCycleInstances`, `useInstanceStageScores`, `resolveStageWeights`/`computeFinalScore` if unused elsewhere, recharts pieces, `BarChart3`).
  - Any deep link still using `?tab=analytics` maps to `bell-curve`.
- `src/components/reports/annual-review/BellCurveTab.tsx` is reused unchanged — one component, two mount points (report + admin), so the two stay in sync.
- No schema, RPC, RLS, service or engine change. Presentation only.

## Risk

- Regression risk: low, single file edit plus dead-code removal; the Bell Curve component is already production-tested in the report.
- Rollback: restore the `AnalyticsTab` function and the old trigger.
- Docs: ADR-218 addendum (ADR-218g) + POLICY §AR-BELL-CURVE note that the Bell Curve is mounted in Admin as well; existing bell-curve tests continue to guard the engine.
