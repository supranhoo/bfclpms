---
name: Safety Phase 8 — Stabilization
description: Phase 8 CLOSED 2026-06-04. Docs/tests-only stabilization shipped; dead-column drop verified complete (columns no longer present in public.safety_settings; rollback script available); release-readiness runtime page + backup-gap closure explicitly deferred with owners; Menu CAPA gates both ends.
type: feature
---
## Close-out (2026-06-04)
Phase 8 formally closed. No DB change, no runtime code, no migration, no Menu Setting / Custom Tabs touch in the close-out pass.

Completed: (1) regression checklist doc, (2) release-readiness report doc, (3) 6-file / 33-test read-only SSOT suite under `src/test/safety/phase8/`, (4) `safety_settings` dead-column drop verified complete (columns no longer present in `public.safety_settings`; rollback script available), (5) memory + changelog updates, (6) Menu CAPA 24/24 re-validated both ends.

Deferred with owners: `/safety/settings/release-readiness` runtime page (Safety lead — flag-gated `release_readiness_v1` default OFF, only on explicit request); Safety backup-gap closure (Platform/Backup — Phase 9 candidate, not started in this pass).

Phase 9 not started in this pass.

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
| Drop `safety_settings.ui_incident_v2` + `incident_stage_copy` columns | ✅ Verified complete 2026-06-04 | Columns no longer present in `public.safety_settings`; rollback script available. Today's re-snapshot: 5-column key/value table, 13 rows, runtime config from row keys, 0 readers, 0 dependents. No new migration applied today. Rollback script at `docs/safety/phase8-dead-column-rollback.sql` (manual only). |
| `/safety/settings/release-readiness` runtime page | Deferred — optional (owner: Safety lead) | A new route is a runtime feature; user required explicit separate approval before any UI ship. Tracked here so it is not forgotten. |
| Safety backup-gap closure (`mem://features/safety/hardening-baseline`) | Deferred to Phase 9 (owner: Platform/Backup) | Out of Phase 8 scope; tracked for Phase 9 kickoff. |

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