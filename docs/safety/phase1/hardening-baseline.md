
## Phase 1.5 remediation — shipped

- **T-001**: `revoke select` on the 6 `mv_safety_*` views from `anon` /
  `authenticated`; `service_role` retains read. `safety-analytics` now
  uses a service-role client gated by `has_any_safety_role(auth.uid())`
  with explicit 401/403 responses.
- **T-003**: `create-backup` `TABLES_TO_BACKUP` extended with the 33
  `safety_*` tables in 5 dependency tiers appended after PMS tiers.
  `STORAGE_BUCKETS` now includes `safety-media`. `safety_notifications`
  added to `PRUNE_TABLES` (90-day window).

`restore-backup` was updated in lockstep: the 33 `safety_*` tables are
now in both `DELETE_ORDER` (leaves first) and `INSERT_ORDER` (parents
first), appended after PMS tiers. All three functions
(`create-backup`, `restore-backup`, `safety-analytics`) are deployed.

`create-backup` finalize now runs a built-in integrity check
(`verifyBackupIntegrity`) — every `<table>.json` is re-listed and
row-counted against the batch manifest; failures degrade the log
status to `completed_with_errors` and the result is embedded in
`manifest.json` under `integrity` for post-hoc forensics.

## Drill verification — shipped

Sandbox backup→restore drill is now first-class:

- Isolated `safety_drill` schema mirrors the three flagship tables.
- `safety-drill` edge function round-trips snapshots through storage.
- One-click drill on `/admin/settings` → Backup & Restore with per-table
  baseline vs after pass/fail.
- Memory regression in `restore-backup` (worker `Memory limit exceeded`)
  fixed: 250-row upsert batches, explicit array release, and tighter
  packBatches insert defaults (2 tables / 2 000 rows max).

See `docs/safety/phase1/backup-restore-drill.md` for the runbook.

Next: kick off Phase 2 (Incident UX).
# Phase 1 — Hardening Baseline (locked)

This is the single page Phase 2+ must not regress. Any deviation is a
Stop Condition under `docs/safety-integration-governance.md`.

## Schema

- 33 `safety_*` tables, all RLS-enabled.
- 6 `mv_safety_*` materialized views, served exclusively by
  `safety-analytics` edge fn (target state — see T-001).
- Enum `safety_app_role` with 8 values: `admin, safety_head,
  safety_officer, bu_head, manager, supervisor, worker, auditor`.
- Idempotency column: `safety_incidents.client_submission_id` (UUID).
- Incident stage constant: `rca` (NOT `root_cause_analysis`).

## RPCs that are the only allowed status-mutation paths

- `transition_safety_incident(incident, to_stage, payload)`
- `assign_permit_number`, `submit_permit`, `activate_permit`,
  `suspend_permit`, `close_permit`, `decide_permit_level`.
- Trigger guards in place: `safety_incident_fsm_guard`,
  `guard_permit_status_write`, `safety_audit_runs_block_status_writes`,
  `safety_drills_block_status_writes`,
  `safety_training_block_status_writes`.

## Edge functions

- `check-safety-sla` — cron + admin/head only. Code-level auth check.
- `grant-safety-role` — PMS admin or Safety admin only. Code-level auth.
- `safety-analytics` — caller-JWT read; depends on T-001 for full safety.

## RBAC

- Authority: `safety_user_roles` only. Never `public.app_role`.
- Role grants always trigger `log_safety_role_change` for audit.

## Cache & isolation

- All Safety React-Query keys prefixed `'safety'`. No PMS file imports
  Safety code; no Safety file imports PMS business logic.
- Cross-module invalidation allowed only: `useSafetyRoles` invalidates
  `['modules']`.

## Offline & evidence

- IndexedDB queue in `src/lib/safetyOfflineQueue.ts`.
- Submissions mint UUID `client_submission_id`; server dedup via
  `safety_incident_before_insert`.

## Outstanding hardening tickets (Phase 1.5 — block Phase 2)

- **T-001** — REVOKE `mv_safety_*` from `anon`/`authenticated`.
- **T-003** — Add Safety tables + `safety-evidence` bucket to
  `create-backup` and verify restore.

## Non-blocking improvements — all shipped

- **T-002** — `search_path` audit confirmed: zero Safety SECURITY DEFINER
  functions are missing `set search_path`. No migration required.
- **T-004** — `check-safety-sla` anon-key bypass removed. Only
  service-role (header or apikey) or admin / safety_head JWT calls are
  accepted.
- **T-005** — `verify_jwt = false` declared for `grant-safety-role`
  (and `check-safety-sla`) in `supabase/config.toml`. Behavior unchanged;
  declaration prevents drift.
- **F-RLS-02** — All 22 Safety RLS policies recreated `TO authenticated`.
  USING / WITH CHECK clauses unchanged.

## Phase 2 gate prerequisites

- T-001 + T-003 merged and verified.
- Architecture + Engineering Manager + Product Owner approvals recorded.
- Memory `mem://features/safety/hardening-baseline` reflects this doc.