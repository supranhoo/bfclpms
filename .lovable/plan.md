## 1. Assumptions

- Source of truth: `public.entitlement_audit` rows where `event_type = 'would_deny'`.
- Available fields per row: `created_at`, `actor_id`, `entity_type='action'`, `entity_key` (= action_key), `client_id`, `reason`, `before/after` (null for would_deny). There is **no `source/page` column** captured today.
- Joinable lookups: `action_registry(action_key → label, module_key, risk_level)`, `clients(client_id → client_key, display_name)`, `profiles(actor_id → full_name, email)`, `user_roles(user_id → role)`.
- Access gate: `hasRole('platform_owner')`. Route is already wrapped in `PlatformOwnerRoute`; the tab will additionally render an empty state for non-owners as a defense-in-depth check.
- Observe-only: zero behavior changes outside this tab. No new wraps, no enforcement, no schema changes, no migrations.

## 2. Clarifications

- "Page/source if available" — currently not captured. The dashboard will show `reason` (e.g., `observe-mode CanAction render`) as the closest proxy and mark `Source` as `—` when absent. A future phase can extend `CanAction` to include a route path in `reason`; out of scope here.
- "Risk level" filter — derived from `action_registry.risk_level`.
- "Client/Module" filter — `client_id` and `action_registry.module_key`.

## 3. Risk & Impact Report

- **Data impact:** read-only SELECTs on `entitlement_audit` + joins. No writes.
- **Workflow impact:** None. PMS unaffected.
- **UI/UX impact:** One new tab `Telemetry` inside `/platform-settings`, after `Audit Logs`. No changes to existing tabs.
- **Regression risk:** Minimal — new code is isolated to `PlatformSettings.tsx` and one new component file.
- **Scalability:** All queries scoped to `event_type='would_deny'`, server-side filters (date, client, module, action, user, risk), default range = last 30 days, table paginated server-side (PAGE_SIZE=50), export capped at 10 000 rows (matches existing Audit Logs export). Aggregations use `count` head queries (no row download) and a single 30-day fetch for the time-series sparkline (currently ~tens of rows, safely bounded).
- **Mitigation:** Reuse the existing `toCsv` helper; reuse `useQuery` with stable keys; respect existing RLS on `entitlement_audit`.

## 4. Step-by-step Plan

1. **Add a new `TelemetryTab`** in `src/pages/platform/PlatformSettings.tsx`:
   - Top KPI cards: Today / Last 7d / Last 30d / All-time would_deny counts (4 `count: 'exact', head: true` queries).
   - "Top would-be-blocked actions" table: aggregates the last-30-days rows in memory grouped by `entity_key` → count, joined to `action_registry` for label, module, risk.
   - "By user" mini-table: top 10 actors by would_deny count (last 30 days), joined to `profiles`.
   - "By client/module" mini-table: counts grouped by `client_id` and `module_key`.
   - 30-day sparkline (simple inline SVG bars, no new dependency) showing daily would_deny counts.
   - Filters bar: date range (from/until), client (select from `clients`), module (select from `module_registry`), action_key (text contains), user (text contains email/name), risk level (select low/medium/high/critical from distinct `action_registry.risk_level`).
   - Recent events table (server-side paginated, PAGE_SIZE=50): When, User (name + email), Role, Client, Module, Action key + label, Risk, Reason.
   - "Export CSV" button (platform_owner only) — reuses `toCsv`, exports current filter set up to 10 000 rows with all derived columns.
   - Banner at the top: "Observe-only telemetry — no PMS action is currently blocked. Data sourced from `entitlement_audit` (`event_type = would_deny`)."
2. **Wire the tab** into the `Tabs` list in `PlatformSettings` between Audit Logs and the end (label: `Telemetry`, icon: `BarChart3`).
3. **Defensive role check** inside `TelemetryTab` — render a small "Platform owner only" alert if `hasRole('platform_owner')` is false.
4. **Docs/Memory/Changelog:**
   - `DOCUMENTATION.md` — Version History entry `v2.66.15.0` describing the dashboard, data sources, and the explicit "no source/page captured yet" gap.
   - `POLICY.md` — add a short note under §Phase20 that the platform_owner Telemetry view is read-only and exposes `would_deny` aggregates only.
   - `mem/features/platform/hub-foundation.md` — one-line addition under Phase 2B note: "Platform_owner Telemetry tab added (read-only would_deny aggregates)."
   - `CHANGELOG_2026.md` — June W1 sub-bullet under Hub Platform.
5. **Tests:** add a small unit test for a new `aggregateByKey` helper (top-N counter) co-located near `toCsv`.
6. **Manual verification:** load `/platform-settings`, open `Telemetry`, confirm KPI numbers match `select count(*) from entitlement_audit where event_type='would_deny'` for matching ranges, confirm filters work, export 10–20 rows.

## 5. UI Changes

- **Location:** `/platform-settings` → new last tab `Telemetry` (after `Audit Logs`).
- **Visual changes:** 4 KPI cards (top row), one sparkline card, three small aggregate tables (Top actions / Top users / By client+module) in a responsive grid, then filters bar + paginated event table + Export CSV button.
- **Interaction:** filter changes refetch the event table and recompute aggregates; pagination via existing chevron pattern; CSV download via blob.
- **Responsiveness:** KPI cards `grid-cols-2 md:grid-cols-4`; aggregate tables `md:grid-cols-3`; table wrapped in `overflow-x-auto`.
- No changes to any other tab or PMS UI.

## 6. Tests

- Unit test for `aggregateByKey([{k:'a'},{k:'a'},{k:'b'}], 'k')` → `[{key:'a',count:2},{key:'b',count:1}]`.
- Existing `toCsv` already covered.

## 7. DOCUMENTATION.md / POLICY.md / Memory updates

- `DOCUMENTATION.md` — new Version History entry (top): Telemetry dashboard scope, data source, gaps (no page/source field), platform_owner gating.
- `POLICY.md` — append a bullet to §Phase20 stating the Telemetry tab is read-only platform_owner aggregates of `entitlement_audit.would_deny`.
- `mem/features/platform/hub-foundation.md` — single line addition; no invariant change.
- `CHANGELOG_2026.md` — one sub-bullet under Hub Platform.

## 8. Post-implementation notes

- **Out of scope:** any enforcement, additional `CanAction` wraps, schema migrations, capturing `route/page` in `would_deny` rows, realtime subscriptions.
- **Rollback:** remove the `Telemetry` tab entry and the `TelemetryTab` component — single-file revert. No DB rollback needed.
- **Follow-up (future, not part of this plan):** extend `CanAction` to include `window.location.pathname` in `reason` so the dashboard can attribute events to pages; add realtime refresh when usage grows.

## Files to be changed

- `src/pages/platform/PlatformSettings.tsx` — add `TelemetryTab`, helper `aggregateByKey`, new tab entry, new icon import.
- `src/test/platformTelemetry.test.ts` *(new)* — unit test for `aggregateByKey`.
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, `mem/features/platform/hub-foundation.md` — short doc/memory updates.

No other files touched. No backend, migrations, RLS, workflow, scoring, menu, reports, or permissions changes.
