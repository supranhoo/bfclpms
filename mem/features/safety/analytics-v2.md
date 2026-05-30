---
name: Safety Analytics v2 (Phase 10)
description: Flag-gated monthly trend chart, BU heatmap, and KPI drill-downs on top of Phase 7 analytics
type: feature
---
# Safety Analytics v2 — Phase 10

## Flag
- `safety_settings.ui_safety_analytics_v2` (boolean, default `false`). Phase 7 layout is preserved verbatim when OFF.

## New materialized view
- `public.mv_safety_incident_monthly_trend` — dense (BU × month) grid over rolling 12 months.
  - Columns: `month_start`, `period_year`, `period_month`, `business_unit_id`, `total_count`, `critical_count`, `high_count`, `medium_count`, `low_count`, `recordable_count` (= incident_type IN accident/property_damage), `closed_count`.
  - `GRANT SELECT ... TO authenticated`. Aggregates only.
  - Added to `public.refresh_safety_analytics()` (REFRESH CONCURRENTLY).

## New UI (flag-gated)
- `SafetyTrendChart` — stacked recharts AreaChart of severity counts per month.
- `SafetyHeatmap` — color-intensity matrix (Critical / High / Open / Recordable) per BU. Intensity normalised per column.
- `KpiDrillDownDialog` — clicking the Open / Closed / Critical KPI tiles opens an incident list filtered client-side from the cached `useSafetyIncidents()`. Capped at 100 rows on screen.

## SSOT helpers (`src/lib/safetyAnalytics.ts`)
- `aggregateMonthlyTrend(rows)` — sums per month across BUs, sorts chronologically, emits short label via `monthLabel`.
- `monthLabel(year, month)` — e.g. `"Jun '26"`.
- `heatmapIntensity(value, max)` — returns 0..1; safe for zero/null/negative inputs.

## Invariants
- Additive only. No Phase 7 tile, table, badge, or refresh control is removed or restyled.
- ZERO writers in v2 code paths (`.insert / .update / .upsert / .delete / .rpc / .upload / fetch(` are forbidden). Tests guarded by `src/test/safety/safetyAnalyticsV2.test.ts` + the existing no-writer suites for adjacent files.
- Drill-down NEVER opens a new query key or realtime subscription.
- Rollback = flip flag back to `false`. MV may stay (cheap) or be dropped — no data migration needed because no rows are written against it.