---
name: Safety Analytics (Phase 7)
description: TRIR materialized views, hours-worked entry, dashboard, refresh RPC and 30-min cron
type: feature
---
# Safety Analytics — Phase 7

## Tables
- `safety_hours_worked` (BU × year × month, unique) — admin/safety_head write; admin/safety_head/safety_officer read.

## Materialized Views (rolling 12mo unless noted)
- `mv_safety_trir` — recordable types = `accident`, `property_damage`. TRIR = (cases × 200,000) / hours.
- `mv_safety_severity_rate`, `mv_safety_incidents_open_vs_closed`
- `mv_safety_training_compliance` (single row, all-time)
- `mv_safety_audit_scoreboard` — runs in `submitted|reviewed`
- `mv_safety_permit_throughput` — last 90 days

All MVs are `GRANT SELECT` to `authenticated` (aggregates only, no PII).

## Refresh
- `public.refresh_safety_analytics()` SECURITY DEFINER, callable by admin/safety_head OR by cron (auth.uid() IS NULL).
- pg_cron `safety-analytics-refresh-30min` runs `*/30 * * * *`.
- Uses `REFRESH MATERIALIZED VIEW CONCURRENTLY` for indexed views; training MV has no unique index → non-concurrent.

## SSOT helpers (`src/lib/safetyAnalytics.ts`)
- `computeTRIR(cases, hours)` — null when hours ≤ 0; rounds to 2 dp.
- `complianceBand(score)`: ≥90 Excellent · ≥75 Good · ≥60 Fair · else Poor.
- `trirBand(trir)`: <1 Low · <3 Moderate · <5 High · else Critical.
- `aggregateTotals(payload)` — org-wide totals; audit avg is run-count-weighted.
- `toCsv(rows, columns)` — CSV with proper quoting.

## UI
- `/safety/analytics` — KPI tiles, BU heatmap, severity stack, audit panel, CSV export, manual refresh button.
- `/safety/settings/hours-worked` — admin entry/upsert/delete (uses `ConfirmDestructiveDialog`).

## Tests
`src/test/safetyAnalytics.test.ts` — 16 tests covering TRIR math, banding, CSV escaping, aggregation, recordable filter parity with SQL.
