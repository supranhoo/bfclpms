---
name: Hub Platform Foundation (Phase 1)
description: Observe-only Hub platform layer — module/action/capability registries, client entitlements, audit log, /platform-settings shell, all gated behind hub_platform_settings_enabled flag (default OFF)
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