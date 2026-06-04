---
name: Safety Phase 8 — Stabilization
description: Phase 8 close-out — docs/tests-only stabilization; dead-column drop deferred; release-readiness runtime page deferred; Menu CAPA gates both ends.
type: feature
---
## Scope
Phase 8 is a low-risk validation phase: regression checklist + release-readiness doc + read-only SSOT tests + memory/changelog updates. No new runtime route, RPC, edge fn, MV, or behavior change.

## Test artifacts
- `src/test/safety/phase8/` — 6 files, 33 read-only SSOT tests, all green:
  - safety-module-gate · safety-rls-smoke · analytics-mv-contract
  - safety-settings-rows-vs-columns · emergency-contacts-ssot · module-hub-realtime
- Menu CAPA suite (`src/test/menu/*` + `src/test/menu-setting-capa.test.ts`) re-validated at 24/24 green at phase start and phase end.

## Docs
- `docs/safety/phase8-regression-checklist.md`
- `docs/safety/phase8-release-readiness.md`

## Deferred items (do NOT silently remove)
| Item | Status | Reason |
|---|---|---|
| Drop `safety_settings.ui_incident_v2` + `incident_stage_copy` columns | ✅ Verified complete 2026-06-04 | Drop already happened in a prior session — `pg_attribute` attnums 6 & 7 tombstoned (`attisdropped = true`). Today's re-snapshot: 5-column key/value table, 13 rows, runtime config from row keys, 0 readers, 0 dependents. No new migration applied today. Rollback script at `docs/safety/phase8-dead-column-rollback.sql` (manual only). |
| `/safety/settings/release-readiness` runtime page | Deferred — optional | A new route is a runtime feature; user required explicit separate approval before any UI ship. Tracked here so it is not forgotten. |

## Invariants
- Menu CAPA I1–I4 must remain green before and after every Safety release.
- `safety_settings` runtime config is row-keyed (`key` / `value`). No code may read `ui_incident_v2` / `incident_stage_copy` as columns — guarded by `safety-settings-rows-vs-columns.test.ts`.
- `useModules` realtime subscriptions on `safety_module_access` / `iac_user_role_assignments` / `safety_user_roles` must all invalidate the `['modules']` query — guarded by `module-hub-realtime.test.ts`.
- `useEmergencyContacts` reads `safety_emergency_contacts` only; no JSONB fallback — guarded by `emergency-contacts-ssot.test.ts`.
- Every Safety table has ENABLE ROW LEVEL SECURITY somewhere in migration history; no DISABLE anywhere — guarded by `safety-rls-smoke.test.ts`.

## Rollback
- Tests: `rm -rf src/test/safety/phase8`.
- Docs: revert the two `docs/safety/phase8-*.md` files.
- No migration shipped, so no DB rollback needed.

## Out of scope (and will stay out)
- Menu Setting / Custom Tabs changes.
- Re-enable `menu_overrides_enabled` in production.
- PMS workflow / scoring / RLS / enforcement changes.
- Production experiments.