# Fix: Auditor "Add Observation" & Bulk Review Score Save Failures

## Root Cause Analysis (from live Postgres error logs)

Two distinct DB-level failures — not the KPI schema issue we chased earlier.

### Bug 1 — Bulk Review score save fails
Error: `record "new" has no field "functional_manager_achieved_value"`

The trigger `public.enforce_self_snapshot_mirror` (BEFORE UPDATE on `review_submissions`) references `NEW.functional_manager_achieved_value`, but that column does **not exist** on `review_submissions`. The table has only these achieved_value columns:
`achieved_value, self_achieved_value, manager_achieved_value, skip_level_achieved_value, hr_pms_achieved_value, auditor_achieved_value, management_achieved_value`.

Every bulk-review UPDATE that changes `achieved_value` aborts with `42703`.

### Bug 2 — Adding observation (Auditor) fails
Error: `not authorized to send notifications to user <kpi_owner>` (SQLSTATE 42501)

`notify_on_observation_change` (AFTER INSERT on `kpi_observations`) inserts a notification for the KPI owner. `tg_notifications_enforce_sender_relationship` then calls `can_send_notification_to(auditor, kpi_owner)`. The current function only accepts an auditor when a row exists in `audit_kpi_assignments (auditor_id, employee_id)`. Ayush audits employees via the **level-based** assignment table `audit_kpi_level_assignments` (and via role scope), so the auditor branch returns false and the trigger raises.

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | No schema change to data tables. Only function bodies replaced. |
| Workflow | Restores bulk score save and auditor observation add. No behavior change for other roles. |
| UI/UX | None. |
| Regression | Low. Both changes are narrow: (a) drop reference to a non-existent column, (b) widen an existing auditor allow-branch. |
| Security | Notification authorization stays role-gated. Auditors already have read/comment access to KPIs of employees they audit; they gain no new visibility, only the ability to notify those employees. |
| Rollback | Both are `CREATE OR REPLACE FUNCTION` — revert by reissuing prior definition. |
| Scalability | New EXISTS subquery is index-backed (`audit_kpi_level_assignments` has FK indexes on auditor/employee). |

## Plan

1. **Migration — fix `enforce_self_snapshot_mirror`**
   - Remove the `NEW.functional_manager_achieved_value` clause from the `reviewer_stage_touched` expression. Keep all other reviewer-stage checks intact. No other logic change.

2. **Migration — widen auditor branch in `can_send_notification_to`**
   - In the auditor block, accept the sender when EITHER:
     - a row in `audit_kpi_assignments (auditor_id=sender, employee_id=target)`, OR
     - a row in `audit_kpi_level_assignments` that resolves the sender as an auditor of any KPI owned by `target` (join through `kpis`/`profiles` on the level dimensions already used elsewhere in the app's auditor-scope resolver).
   - Leaves the admin / HR PMS / management / manager / reviewer / annual-review branches untouched.

3. **Regression tests**
   - Extend `src/test/notificationsSenderRelationshipSchema.test.ts` with a schema-truth assertion that every column referenced by `enforce_self_snapshot_mirror` exists on `review_submissions` (parsed from the migration file against `src/test/fixtures/notificationRelationshipSchema.ts` — extended with a `review_submissions` fixture).
   - Add a unit test asserting the auditor branch of `can_send_notification_to` accepts a level-assignment-only auditor (mock via SQL fixture executed in the test harness).

4. **Verification**
   - `psql` smoke: `UPDATE review_submissions SET achieved_value = achieved_value WHERE id = <sample>` succeeds without `42703`.
   - `psql` smoke as an auditor with only `audit_kpi_level_assignments`: `INSERT INTO kpi_observations …` succeeds and the follow-on notification row is created.
   - Re-check `postgres_logs` for the two error strings after deploy — expect zero new occurrences.

5. **Docs & policy**
   - `DOCUMENTATION.md`: note the two trigger corrections under Version History.
   - `POLICY.md`: record that auditor-to-employee notification authorization is granted through either direct or level-based audit assignment.
   - `docs/adr/ADR-107.md`: append the corrected root cause and the two fixes.

## Out of Scope (Observed but Deferred)

The same log window shows three unrelated errors — flagged for a **separate** ticket so this fix stays surgical:
- `operator does not exist: review_status = text` (enum cast missing in some RPC).
- `permission denied for function has_role` / `can_send_notification_to` (anon role hitting these — needs `REVOKE FROM anon` or an anon-safe wrapper).
- `invalid input syntax for type uuid: "null"` (client passing the string `"null"`).

Confirm you want these deferred, or expand scope before I implement.
