## Phase 2E — Telemetry Dashboard Enhancements

Read-only refinement of the existing Telemetry tab in `src/pages/platform/PlatformSettings.tsx`. No PMS behavior changes, no new wrappers, no enforcement, no DB schema changes, no RLS/permissions/menus/reports/workflow/scoring changes. Existing Audit Logs tab is untouched.

### Assumptions
- Data source remains `entitlement_audit` filtered by `event_type = 'would_deny'`. Route/page lives in `after->>pathname` and `after->>search` (Phase 2D).
- Platform-owner-only gating is already enforced inside `TelemetryTab`.
- Existing 30-day aggregate query (cap 5000) is sufficient for trend + breakdowns. Custom ranges that exceed 30 days will run a second bounded query (cap 5000).
- "Role" per row is not reliably resolvable from `entitlement_audit` alone; we will surface role via the actor's current `profiles.role` when available and label it "Current role" to avoid implying it was the role at the time of the event. If user prefers to omit, we drop the Role card.

### Risk & Impact Report
- **Data**: read-only SELECTs against `entitlement_audit`, `profiles`, `clients`, `module_registry`, `action_registry`. No writes.
- **Workflow**: none.
- **UI/UX**: changes confined to the Telemetry tab. New trend chart, new "By page/route" card, new "By role" card, preset-filter chips, clickable rows in breakdown cards that push filters into the events table.
- **Regression risk**: low — additive; existing filters, pagination, CSV export retained. Page column and pathname/search export already present.
- **Scalability**: bucket aggregation done client-side over the same capped 5000-row window already in use. Custom ranges over the cap show a "Showing first 5000 events in range" notice; KPI counts continue to use `count: 'exact', head: true` so totals stay accurate.

### Implementation Plan

1. **Range selector for trend & breakdowns** (state added inside `TelemetryTab`)
   - Add `trendRange: '7d' | '30d' | 'custom'` (default `30d`).
   - Replace `aggQ` `last30` literal with a derived `aggFrom`/`aggUntil` driven by `trendRange` (custom uses the existing `from`/`until` inputs).
   - Query stays a single bounded SELECT (`limit 5000`). KPI cards unchanged.

2. **Trend chart**
   - Replace the existing `Sparkline` with a Recharts `LineChart` (already in the project) showing daily `would_deny` count over the selected range. Tooltip + day axis. Keeps the existing `daily` bucket logic.
   - Verify Recharts dep: if missing in `package.json`, fall back to keeping `Sparkline` and add a simple SVG bar/line with day labels — no new dep.

3. **New breakdown card: By page/route (30d window)**
   - Aggregate `aggRows` by `after.pathname` (blank pathname → label "Not captured").
   - Top 10. Each row clickable → sets a new `routeFilter` state and re-queries `eventsQ` with `.like('after->>pathname', routeFilter)`.

4. **By role card (optional)**
   - Resolve `profiles.role` for actors already fetched in `profilesQ`. Aggregate counts. If `profiles.role` is null for >50% of actors, hide the card (with a "Role data unavailable" note) to avoid misleading numbers.

5. **Drill-down**
   - Top-actions rows: click sets `actionSearch = action_key` (already a filter) and scrolls to the events table.
   - Top-users rows: click sets `userSearch = email`.
   - By client / By module rows: click sets the existing `clientId` / `moduleKey` selects.
   - By page/route rows: click sets the new `routeFilter`.
   - Add a single "Clear all filters" button in the events-table toolbar.

6. **Preset filter chips** (above events table)
   - Chips: `Today`, `Last 7 days`, `Last 30 days`, `High-risk actions`, `Critical actions`, `Current client` (if `snapshot.clientId` present from `useEntitlement`).
   - Each chip writes the existing filter state (`from`, `until`, `risk`, `clientId`). Pure UI sugar over existing filters.

7. **Route column + export**
   - Page column already exists (Phase 2D). Confirm "Not captured" rendering for older rows where `after.pathname` is missing — replace the current `—` with `Not captured` (muted) and keep the `code` chip for present values.
   - CSV export already includes `pathname`, `search`, `source` — no change.

8. **Events query filter extension**
   - `eventsQ` accepts the new `routeFilter`. When set, add `.like('after->>pathname', routeFilter)`. Add to query key.
   - `exportCsv` mirrors the same filter.

9. **Safety guards**
   - All new UI inside the existing `if (!isOwner)` gate.
   - No mutations, no new tables, no edge functions.
   - No changes to `useEntitlement`, `CanAction`, or any PMS files.

### Tests
- Extend `src/test/platformTelemetry.test.ts` (or add `platformTelemetryAgg.test.ts`) for pure helpers only:
  - `bucketByDay(rows, from, until)` returns one entry per day with zero-fills.
  - `aggregateByPathname` treats null/empty as `"Not captured"`.
  - Preset-chip date math (Today / 7d / 30d) returns expected ISO bounds.
  - Drill-down state transitions: clicking a route sets `routeFilter`; "Clear all filters" resets every filter to defaults.

### Documentation & Memory
- `DOCUMENTATION.md` — bump Version History `v2.66.17.0` (Phase 2E telemetry enhancements).
- `POLICY.md` — extend §Phase 2 with: trend chart range, route breakdown, drill-down, preset chips; reaffirm read-only / platform_owner / no enforcement.
- `CHANGELOG_2026.md` — sub-bullet under Platform Hub.
- `mem://features/platform/hub-foundation.md` — append Phase 2E summary.

### Out of Scope
- No new CanAction wrappers (Phase 2F or later).
- No enforcement variant (Phase 3 later).
- No changes to PMS workflow, scoring, reports, menus, RLS, or permissions.
- No DB migrations.

### Rollback
- All changes are additive UI in one file plus one helpers/tests file. Revert by removing the new chart/cards and restoring the previous `Sparkline` block and event-query filter shape.

### Files to change
- `src/pages/platform/PlatformSettings.tsx` (TelemetryTab only)
- `src/lib/platformTelemetryAgg.ts` (new — pure helpers for buckets, route agg, preset ranges)
- `src/test/platformTelemetryAgg.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, `mem/features/platform/hub-foundation.md`

### Acceptance check
- Platform owner sees daily would_deny trend with 7d/30d/custom range.
- Top actions, users, clients, modules, routes, (optional) roles shown for 30d window.
- Clicking a row in any breakdown filters the events table.
- Preset chips quickly apply Today / 7d / 30d / High-risk / Critical / Current client.
- Old rows without route metadata display "Not captured".
- CSV export includes route/page metadata (already shipped in 2D).
- Audit Logs tab unchanged. PMS behavior unchanged.
