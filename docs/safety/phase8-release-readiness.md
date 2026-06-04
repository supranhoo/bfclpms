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

The plan included a destructive cleanup migration that would drop two
verified-dead columns on `safety_settings`:

- `ui_incident_v2 BOOLEAN`
- `incident_stage_copy JSONB`

**Pre-flight result (2026-06-04):**

```
SELECT count(*) FILTER (WHERE ui_incident_v2 IS NOT NULL OR incident_stage_copy IS NOT NULL) AS dirty
FROM public.safety_settings;
→ dirty = 13 / 13 rows
```

The 13 rows are all at the column DEFAULTs (`false` / `{}`) — no row carries
a meaningful value, and no source-code reader references the columns
(verified by `src/test/safety/phase8/safety-settings-rows-vs-columns.test.ts`
and a `rg` scan over `src/`). However, the plan's pre-flight gate is a
strict `IS NOT NULL` check, and that gate fails because defaults populated
every row.

**Decision (per the Phase 8 plan's decision gates):** STOP the destructive
migration; ship the rest of Phase 8. The columns stay physically present
but remain unread. The drop is re-deferred with a tighter pre-flight (e.g.
"every value equals the column default AND no reader references exist") to
be proposed as a separate change set.

## 5. Deferred items (explicitly tracked, not silently removed)

| Item | Status | Reason | Next step |
|---|---|---|---|
| Drop `safety_settings.ui_incident_v2`, `incident_stage_copy` columns | **Deferred** | Strict `IS NOT NULL` pre-flight fails — defaults populated every row | Re-propose with "value = default" pre-flight |
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
