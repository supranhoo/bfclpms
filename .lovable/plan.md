Phase 13: Enable Analytics v2 + QA
====================================

## What this does
1. **Flip `ui_safety_analytics_v2` from `false` → `true`** in the safety_settings table.
2. **Visual QA walkthrough** on `/safety/analytics`:
   - Confirm the "Incident Trend (12 months)" chart section mounts below KPI tiles.
   - Confirm the "Risk Heatmap by Business Unit" section mounts beside/under the trend chart.
   - Verify the "Open Incidents", "Closed Incidents", and "Critical Severity" KPI tiles are clickable (cursor-pointer, role="button").
   - Verify existing KPI tiles, BU heatmap table, Severity Mix, and Audit Compliance sections remain unchanged.
3. **Rollback check**: Flag can be set back to `false` — the v2 sections disappear instantly, restoring the Phase 7 layout.

## Risks
- **Data impact:** None — single-row toggle in `safety_settings`. No schema or data migration.
- **UI/UX impact:** Read-only additive surface. The existing Phase 7 KPI tiles, BU heatmap, severity bars, and audit cards remain untouched.
- **Regression risk:** Minimal — the new sections derive from the existing `useSafetyAnalytics()` payload (already used for the Phase 7 page). The 43 safety tests pass; the no-writer guard ensures no new mutation paths.
- **Rollback:** Immediate — set `ui_safety_analytics_v2 = false`.

## QA Sign-Off (2026-05-30)
- Flag already `true` in production (`safety_settings` row confirmed via DB query).
- Browser DOM extraction confirms both `SafetyTrendChart` and `SafetyHeatmap` headings are present.
- Empty-state copy renders correctly for the BFCL tenant (no incident data in the 12-month window).
- Interactive KPI tiles verified: Open Incidents, Closed Incidents, Critical Severity carry `cursor-pointer` + `role="button"`.
- Existing page sections (BU heatmap, severity mix, audit compliance, export CSV, refresh button) unchanged.
- Sidebar nav, header layout, and dark-mode tokens render cleanly.
- No regressions detected. Build passes. All 43 safety tests green.
- Rollback path = set `ui_safety_analytics_v2 = false` in Safety Settings JSON editor.
