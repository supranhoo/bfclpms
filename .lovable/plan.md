# Hub Platform Foundation — Phase 1 (Observe-Only)

## Goal
Lay the Hub-level platform foundation (super-admin role, global registries, entitlements, Platform Settings shell) **seeded read-only from current PMS** with **zero enforcement** against live PMS. Every existing PMS route, menu_key, role, workflow, score, dashboard, and report behaves identically after this phase.

## Non-Goals (deferred to later phases)
- Backend enforcement of action/entitlement denials (Phase 5–6)
- Workflow/scoring/dashboard config adapters (Phase 7)
- HRMS/LMS/Safety registration API (Phase 8)
- Signed on-prem entitlement package import/verify (Phase 9)
- Analytics/BI registry, AI registry, integration hub (Phases 10–11)

## Risk & Impact Report
| Dimension | Impact | Mitigation |
|---|---|---|
| Existing PMS workflows / scoring / final scores | None | No code path reads new tables yet |
| Routes / menu_keys / menu access | None | Registries are additive; existing `menu_registry` / `menu_access_config` untouched |
| Auth | Adds one new app_role value (`platform_owner`); existing roles unchanged | Enum extension only — no role removed or renamed |
| RLS | New tables ship with RLS + GRANTs from day one | Follows project public-schema grants policy |
| Backup | Auto-included via `get_backup_table_order()` | No denylist entries |
| Regression risk | Very low — new tables, new page, new hook all gated by feature flag `hub_platform_settings_enabled` (default OFF) | Master switch lets ops disable the entire shell instantly |
| Scalability | Registry tables are small (<10k rows lifetime); entitlement lookup memoized in hook | Indexed on `(client_id, key)` |

## Architecture (SSOT layering)
```text
                  Hub (Platform Owner)
                         |
   +---------------------+---------------------+
   |          GLOBAL REGISTRIES (observe)      |
   |  module_registry                          |
   |  action_registry                          |
   |  capability_registry                      |
   |  (notif/report/dashboard/ai/integration   |
   |   registries stubbed, populated later)    |
   +---------------------+---------------------+
                         |
   +---------------------+---------------------+
   |       ENTITLEMENT LAYER (observe)         |
   |  clients                                  |
   |  client_module_entitlements               |
   |  client_action_entitlements               |
   |  entitlement_audit                        |
   +---------------------+---------------------+
                         |
              Existing PMS (unchanged)
              menu_registry / menu_access_config
              user_roles / workflows / kpis / ...
```

Code = engines (resolver hooks, guards). DB = behavior (registry rows, entitlement flags). Frontend = UI only.

## Step-by-step Plan

### Step 1 — Identity: `platform_owner` role
- Migration: add `'platform_owner'` to `public.app_role` enum.
- Add to `src/lib/roles.ts` `ALL_APP_ROLES` (SSOT).
- Seed one row in `user_roles` for the designated owner (UI prompt later; not in this PR).
- **Verification:** existing role checks compile; `effectiveRole` typing widens; no existing branch references the new role.

### Step 2 — Global registry tables (Hub-scoped, multi-tenant ready)
All tables carry `client_id uuid NULL` (NULL = global default). All ship with RLS + GRANTs in the same migration.

- `module_registry` — `module_key` PK, `label`, `description`, `is_system`, `sort_order`, `client_id` NULL, `entitlement_source`, `entitlement_version`, `valid_from`, `valid_until`, `signature_hash` NULL. Seeded: `pms` (system, always on).
- `action_registry` — `action_key` PK (e.g. `pms.admin.users.add`), `module_key` FK, `label`, `description`, `risk_level` (`low|medium|high|critical`), `is_system`, `client_id` NULL. Seeded with the high-risk PMS actions enumerated in the spec (users.add/edit/manage_access/password_rollout, workflow.final_score_rules.edit, reports.performance.export, menu.create_tab, menu.delete_custom_tab, working_days.edit, kra.assign, import, export). Read-only registry — not yet wired to UI guards.
- `capability_registry` — `capability_key` PK, `module_key`, `label`, `description`, `client_id` NULL. Stubbed with one capability per existing PMS role for backward-compat mapping.
- Stub tables (created empty, no UI this phase): `dashboard_registry`, `report_registry_v2`, `notification_event_registry`, `ai_feature_registry`, `integration_connector_registry`. Empty rows + RLS only — establishes namespace, no code reads them.

### Step 3 — Entitlement tables (observe)
- `clients` — `id` PK, `client_key` UNIQUE, `display_name`, `deployment_mode` (`saas|on_prem|hybrid`), `is_active`, future-ready fields (`entitlement_source`, `entitlement_version`, `valid_from`, `valid_until`, `signature_hash` NULL — no signing logic this phase).
- `client_module_entitlements` — `(client_id, module_key)` UNIQUE, `is_enabled`, `valid_from`, `valid_until`, `granted_by`, audit ts.
- `client_action_entitlements` — `(client_id, action_key)` UNIQUE, `is_enabled`, same audit columns.
- `entitlement_audit` — append-only log of every entitlement change (`actor_id`, `entity_type`, `entity_key`, `before`, `after`, `reason`, `created_at`). Admin-read, insert via trigger only.
- Seed one row in `clients` for current deployment (`default`), with PMS module entitlement = TRUE, all PMS actions entitled = TRUE. Result: **observe mode = everything allowed = no behavior change**.

### Step 4 — Resolver hook + observe-only guard
- `src/hooks/useEntitlement.ts` — gated by `system_settings.hub_platform_settings_enabled` (default `"false"`). Returns `{ isModuleEntitled(moduleKey), isActionEntitled(actionKey), loading }`. When flag OFF, returns `true` for everything (zero behavior change).
- `src/components/platform/CanAction.tsx` — render-prop wrapper with **observe-only** behavior: always renders children, but when entitlement would deny, logs to `entitlement_audit` via debounced background insert (`would_deny` event type). No UI hidden. Not wired anywhere this phase — shipped as a primitive for Phase 5.
- **Verification:** unit tests (`src/test/entitlement.test.ts`) covering: flag OFF → all true; flag ON + entitled → true; flag ON + denied → false but no throw; observe-mode logs `would_deny` event.

### Step 5 — Hub Platform Settings shell
- New route `/platform-settings` (Hub-level, **not** under `/admin`).
- `ProtectedRoute` variant `PlatformOwnerRoute` that checks `effectiveRole === 'platform_owner'` — admins explicitly cannot see it.
- Page `src/pages/platform/PlatformSettings.tsx` with read-only tabs (every tab shows seeded registry data, no edit UI):
  - Overview (client info, deployment mode, flag status)
  - Clients & Deployment (read-only list)
  - Module Entitlements (read-only matrix client × module)
  - Action Entitlements (read-only table with filter by module/risk)
  - Registries (modules / actions / capabilities — read-only with search)
  - Audit Logs (entitlement_audit viewer, paginated server-side)
- Module Hub: add a **Platform Settings** card visible only when `effectiveRole === 'platform_owner'`. No change for any other role.

### Step 6 — Feature flag + master switch
- Add `hub_platform_settings_enabled` to `system_settings` (default `"false"`). When OFF: route returns 404, hub card hidden, resolver hook returns all-true, observe logger no-ops.
- Document toggle in `DOCUMENTATION.md` + add row to `mem/features/admin/hub-platform-foundation`.

### Step 7 — Pagination & lean-load compliance
- All Platform Settings tables: server-side pagination (page size 50), search via ILIKE on key/label, sortable columns. Follows existing `mem/architecture/performance/lean-load-policy`.

### Step 8 — Tests
- `src/test/platformFoundation.test.ts`:
  - `platform_owner` role added to enum and `ALL_APP_ROLES`
  - Existing 7 roles unchanged (snapshot test)
  - Entitlement resolver: flag OFF → all true
  - Entitlement resolver: missing key → deny (when flag ON)
  - Observe-mode `would_deny` writes audit row, never throws
  - PMS module seeded entitled
  - PMS action seeds present (assert each high-risk key)
- Existing test suites must pass unchanged (regression gate).

### Step 9 — Documentation
- `docs/adr/ADR-072.md` — Hub platform foundation architecture decision.
- `DOCUMENTATION.md` — new "Hub Platform Layer" section.
- `POLICY.md` — entitlement layering, observe-mode contract, super-admin boundary, on-prem deferral note.
- `mem://features/platform/hub-foundation` — capture invariants (multi-tenant client_id NULL, observe-only, flag-gated, action_key immutable, no enforcement yet).

## UI Changes
| Where | What | Visible to |
|---|---|---|
| Module Hub | New "Platform Settings" card (only when flag ON) | `platform_owner` only |
| `/platform-settings` | New page with 6 read-only tabs | `platform_owner` only |
| Everywhere else | No change | All users |

Responsive: tabs collapse to dropdown <md; tables horizontally scrollable; follows existing `responsive-ui-strategy`.

## Rollback Strategy
- All changes additive. Rollback = set `hub_platform_settings_enabled = "false"` (instant) and revoke the platform_owner role row.
- Migration is non-destructive (new tables, new enum value — no drops, no renames). Reversible by `DROP TABLE` on new tables + leaving the enum value (Postgres cannot drop enum values safely — accepted residual).

## Acceptance Criteria
- All existing PMS tests pass.
- Existing PMS user (admin) sees zero UI change.
- With flag OFF, `/platform-settings` returns 404 and Hub card is hidden.
- With flag ON + platform_owner role, the 6 read-only tabs render seeded data.
- `useEntitlement` returns true for every action with flag OFF.
- `CanAction` in observe mode never hides children and logs `would_deny` events when applicable.
- New tables have RLS + GRANTs and appear in backup coverage automatically.
- No new hardcoded business values — every seed row lives in the DB.

## Out of scope confirmation (for the user)
This plan deliberately does **not** touch: workflow engine, KPI scoring, final score rules, menu_access enforcement, dashboard logic, report builder, AI features, integrations, on-prem signing, HRMS/LMS/Safety registration. Those are later phases and will each get their own plan + observe→enforce gate.
