---
name: Hub Platform Foundation (Phases 1-2)
description: Observe-only Hub platform layer with writable entitlement toggles + filtered/paginated audit log + CSV export. All gated behind hub_platform_settings_enabled + platform_owner role. ZERO PMS enforcement.
type: feature
---
# Hub Platform Foundation — Phase 1 (Observe-Only)

## Invariants
- Master switch `system_settings.hub_platform_settings_enabled` defaults to `"false"`. While OFF: `/platform-settings` is 404, Module Hub card hidden, `useEntitlement` returns allow-all → zero PMS behavior change.
- No enforcement against PMS this phase. `CanAction` always renders children; on a would-deny it inserts a `would_deny` audit row but never blocks.
- `action_key` and `module_key` are immutable identities. Never rename or reuse.
- Multi-tenant ready: every registry table carries `client_id uuid NULL` (NULL = global). One `clients` row seeded (`default`).
- Super-admin identity: dedicated `platform_owner` value in `public.app_role` enum. Admins explicitly cannot access `/platform-settings`. Existing 7 roles unchanged.
- On-prem deferred: `clients.signature_hash`/`entitlement_source`/`entitlement_version`/`valid_from`/`valid_until` are schema-only placeholders. No signing/import/verify logic yet.

## Tables
- Registries: `module_registry`, `action_registry`, `capability_registry` + stubs `dashboard_registry`, `report_registry_v2`, `notification_event_registry`, `ai_feature_registry`, `integration_connector_registry`.
- Entitlements: `clients`, `client_module_entitlements`, `client_action_entitlements`.
- Audit: `entitlement_audit` (append-only; event_type in grant/revoke/update/would_deny/admin_view). Authenticated can insert (observe-mode logging); admin/platform_owner can read.
- RLS: read=authenticated; write=platform_owner only. Auto-included in backups via `get_backup_table_order()`.

## Code
- `src/hooks/useEntitlement.ts` — gated resolver. Pure helpers `resolveModule`/`resolveAction` exported for unit testing.
- `src/components/platform/CanAction.tsx` — observe-only guard. Renders children, logs `would_deny` once per mount when flag is ON + denied.
- `src/components/layout/PlatformOwnerRoute.tsx` — gates `/platform-settings` on `role === 'platform_owner'` AND `hubEnabled`. Else `Navigate to /home`.
- `src/pages/platform/PlatformSettings.tsx` — read-only tabs (Overview, Clients, Module Entitlements, Action Entitlements, Registries, Audit Logs). PAGE_SIZE=50.

## Seeds
- Module: `pms`.
- Actions (PMS, high-risk): users.add/edit/manage_access/password_rollout/working_days, kra.assign, workflow.final_score_rules.edit, workflow.template.edit, menu.create_tab, menu.delete_custom_tab, reports.performance.export, data.import, data.export.
- Capabilities: one per existing PMS role.
- Client `default` with PMS module + all PMS actions entitled = TRUE (observe-mode contract).

## Not in this phase
Workflow/scoring/dashboard config adapters, HRMS/LMS/Safety registration, signed on-prem packages, analytics/AI registries, backend enforcement of action denials. Each gets its own observe→enforce gate later.

## Rollback
Set flag `hub_platform_settings_enabled = "false"` (instant). Tables are additive; never enforce against PMS.

## Phase 2 — Admin write surface (shipped)
- `/platform-settings` Module/Action Entitlement tabs are writable for `platform_owner` only. Toggle writes `is_enabled` and inserts an `entitlement_audit` row (`event_type='update'`, before/after JSON, `reason='platform_settings toggle'`).
- Audit Logs tab: server-side pagination (`PAGE_SIZE=50` with `count: 'exact'`), filters (event_type Select, entity_key `ilike`, date range from/until), `Download CSV` button capped at 10000 rows, gated to `platform_owner`.
- `toCsv()` helper in `src/pages/platform/PlatformSettings.tsx` is RFC 4180 compliant (escapes commas/quotes/newlines, JSON-stringifies objects). Exported for unit tests.
- Toggle mutations invalidate `['platform-settings', 'cme-joined' | 'cae-joined']`, `['platform-settings', 'audit']`, and `['hub-entitlement-snapshot']` so the resolver picks up changes immediately.
- Observe-only contract still in force: a disabled entitlement does NOT block any PMS behavior. Enforcement is deferred to a later phase (one action at a time).

## Phase 2B — Observe-only wraps (shipped)
- 13 PMS high-risk action trigger buttons now wrapped with `<CanAction actionKey="...">`:
  `pms.users.add`, `pms.users.edit`, `pms.users.manage_access`, `pms.users.password_rollout`, `pms.users.working_days`, `pms.kra.assign`, `pms.workflow.final_score_rules.edit`, `pms.workflow.template.edit`, `pms.menu.create_tab`, `pms.menu.delete_custom_tab`, `pms.reports.performance.export`, `pms.data.import`, `pms.data.export`.
- Observe-only contract unchanged: children always render, action is never blocked. When the master switch is ON and an entitlement is OFF, exactly one `would_deny` telemetry row is inserted per mounted surface via `loggedRef`. No re-render spam.
- No PMS enforcement yet. No workflow, scoring, menu, reports, RLS, or permission changes.
- Files touched: `src/components/platform/CanAction.tsx` (no change, contract honored), `src/pages/platform/PlatformSettings.tsx` (Master switch display + platform_owner toggle), `src/pages/admin/UserManagement.tsx`, `src/components/admin/UserAccessSheet.tsx`, `src/components/admin/EmployeeWorkingDaysDialog.tsx`, `src/components/admin/SmartAssignmentDialog.tsx`, `src/components/admin/TemplateFormDialog.tsx`, `src/components/admin/MenuSettingTab.tsx`, `src/pages/admin/ImportData.tsx`.
- **Telemetry tab (shipped):** read-only platform_owner aggregates of `entitlement_audit.would_deny` rows (KPI cards, top actions/users, by client/module, 30-day sparkline, filtered + paginated event table, CSV export). No invariant change.
- **Route/page metadata (shipped):** `CanAction` writes a sanitized `{pathname, search, source, mode, client_id, action_key, captured_at}` blob into `entitlement_audit.after`. Sensitive query-string keys (`token`, `access_token`, `refresh_token`, `code`, `apikey`, `api_key`, `password`, `secret`, `id_token`, `key`, `signature`) replace `search` with `"[redacted]"`. Pathname/search truncated to 256 chars. Telemetry tab surfaces a `Page` column. No schema change.
- **Telemetry dashboard enhancements (Phase 2E, shipped):** Recharts daily-trend line chart with `7d / 30d / Custom` range selector; new **By page / route** breakdown card (blank pathnames grouped as "Not captured"); click-to-filter drill-down on every breakdown card; preset chips above the events table (`Today`, `Last 7 days`, `Last 30 days`, `High-risk`, `Critical`, `Current client`) + `Clear all filters`; active route-filter pill with one-click clear; events query + CSV export gain server-side `after->>pathname` equality filter. Pure helpers `bucketByDay`, `aggregateByPathname`, `presetRange`, `defaultFilters` live in `src/lib/platformTelemetryAgg.ts` (7 unit tests). Read-only, platform-owner only; no enforcement, no new `CanAction` wraps, no schema change.
- **Phase 3 pilot (shipped):** First behavior-changing gate — `pms.data.export` is now enforceable in UI when all four gates trip (master ON + `hub_enforcement_pilot_enabled = true` + action in hard-coded allowlist `['pms.data.export']` + entitlement OFF). `entitlement_audit_event_type_check` extended with `'deny'`; new helpers in `src/lib/platformEnforcement.ts` + `useEnforcementPilot()` / `logDeny()` in `useEntitlement.ts`. `CanAction` renders disabled overlay + click-shield + `toast.error(BLOCK_MSG)` when blocked, exactly one `deny` audit row per mount, observe-mode logging suppressed for the blocked mount. Platform Settings Overview gains a platform_owner-only "Enforcement pilot" Switch (two-way confirm dialog, disabled while master OFF). Other 12 wrapped actions remain observe-only. No backend/RLS/RPC enforcement. Rollback = flip pilot flag OFF.