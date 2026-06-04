# Safety Phase 8 — Release Readiness Report

**Status:** Phase 8 closed (docs + tests + cleanup; runtime page deferred) · **Date:** 2026-06-04

## 1. Test posture

| Suite | Files | Tests | Status |
|---|---|---|---|
| Menu CAPA (I1–I4) | 6 | 24 | ✅ green |
| Safety Phase 1–7 SSOT | (existing) | 125 | ✅ green per roadmap version history |
| Safety Phase 8 SSOT (new) | 6 | 33 | ✅ green |
| **Safety total** | — | **≥158** | ✅ |

Phase 8 SSOT files live under `src/test/safety/phase8/`:

- `safety-module-gate.test.ts` — `useModules` reads `modules` table + RPC gate.
- `safety-rls-smoke.test.ts` — static scan: every core Safety table has ENABLE ROW LEVEL SECURITY in migration history; no DISABLE ROW LEVEL SECURITY anywhere.
- `analytics-mv-contract.test.ts` — `useSafetyAnalytics` still names the canonical MVs and goes through `refresh_safety_analytics` RPC.
- `safety-settings-rows-vs-columns.test.ts` — runtime config reads via row keys; no code accesses `ui_incident_v2` / `incident_stage_copy` as columns.
- `emergency-contacts-ssot.test.ts` — `useEmergencyContacts` reads `safety_emergency_contacts` only; no JSONB fallback.
- `module-hub-realtime.test.ts` — realtime subscriptions on `safety_module_access`, `iac_user_role_assignments`, `safety_user_roles` all invalidate the modules query.

## 2. Materialized view refresh

- Refresh path: `refresh_safety_analytics()` RPC (server-side, single transaction).
- Cadence: invoked by Safety analytics page on demand and by the existing cron schedule (see `mem/features/safety/analytics.md`).
- Views: `mv_safety_trir`, `mv_safety_severity_rate`, `mv_safety_incidents_open_vs_closed`, `mv_safety_training_compliance`, `mv_safety_audit_scoreboard`, `mv_safety_permit_throughput`, `mv_safety_incident_monthly_trend`.

## 3. Edge-function auth posture

No edge-function changes in Phase 8. Reference: `docs/safety/phase1/edge-function-auth.md`.

## 4. Schema cleanup outcome

**Resolved 2026-06-04.** Both deferred dead columns were dropped from
`public.safety_settings`:

- `ui_incident_v2 BOOLEAN`  ← dropped
- `incident_stage_copy JSONB` ← dropped

Re-snapshotted pre-flight at apply time: 2 columns present · 13/13 rows
at column defaults (`false` / `{}`) · 0 dependents (views / routines /
policies / triggers) · 0 readers (`rg` repo-wide). The migration carried
an in-transaction precondition guard that would `RAISE EXCEPTION` if any
row carried non-default data, and used plain `DROP COLUMN` (no CASCADE)
so a hidden dependent would fail loudly.

Rollback artefact committed at `docs/safety/phase8-dead-column-rollback.sql`
(additive, nullable, default-restored). Not auto-applied.

## 5. Deferred items (explicitly tracked, not silently removed)

| Item | Status | Reason | Next step |
|---|---|---|---|
| Drop `safety_settings.ui_incident_v2`, `incident_stage_copy` columns | ✅ **Resolved 2026-06-04** | Re-snapshotted pre-flight passed (defaults-only + 0 readers + 0 dependents). Plain `DROP COLUMN` applied with in-transaction guard. | Rollback script at `docs/safety/phase8-dead-column-rollback.sql` (manual). |
| `/safety/settings/release-readiness` runtime page | **Deferred — optional** | A new route is a runtime feature; user explicitly required a separate approval before any UI ship | Propose as a flag-gated subtask (`release_readiness_v1`, default OFF) only if requested |

## 6. Constraints honored

- Menu CAPA invariants re-validated before and after the phase (24/24).
- `menu_overrides_enabled` stays `false` in production.
- No Menu Setting / Custom Tabs change.
- No PMS workflow / scoring / RLS / enforcement change.
- No new Safety runtime feature (no new RPC, edge fn, MV, or route).
- No production experiments.

## 7. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering Manager | | | |
| QA Lead | | | |
| Release Manager | | | |
