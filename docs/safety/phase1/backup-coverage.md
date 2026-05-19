# Backup Coverage — Safety Tables

## Method

Inspected `supabase/functions/create-backup/index.ts` `TABLES_TO_BACKUP`
constant and compared against the 33 `safety_*` tables in production.

## Result

🚨 **GAP — Zero Safety tables are included in the backup engine.**

`TABLES_TO_BACKUP` enumerates 81 PMS tables. Not one `safety_*` table is
listed. Verified via:

```sh
rg -o "'safety_[a-z_]+'" supabase/functions/create-backup/index.ts   # 0 hits
```

## Stop condition triggered

Per `docs/safety-integration-governance.md` §Stop Conditions, "Backup
coverage validation complete" is a Phase 1 production-safety checklist
item. It currently **fails**. Phase 2 must not start until this is
remediated, **or** the gap is formally accepted by Architecture +
Engineering Manager in writing.

## Remediation ticket — T-003

Scope (Phase 1.5, requires its own migration + approval):

1. Append the 33 `safety_*` tables to `TABLES_TO_BACKUP` in the correct
   dependency tier:
   - **Tier 1:** `safety_module_access`, `safety_settings`, `safety_severity_sla`, `safety_sops`, `safety_quizzes`, `safety_quiz_questions`, `safety_emergency_contacts`, `safety_permit_type_config`, `safety_audit_templates`, `safety_audit_template_items`.
   - **Tier 2 (depends on Tier 1 + `profiles`/`business_units`):**
     `safety_user_roles`, `safety_hours_worked`, `safety_assets`,
     `safety_emergency_drills`, `safety_audit_runs`,
     `safety_training_assignments`.
   - **Tier 3:** `safety_asset_calibrations`, `safety_asset_evidence`,
     `safety_drill_participants`, `safety_drill_findings`,
     `safety_audit_run_responses`, `safety_training_attempts`,
     `safety_permits`.
   - **Tier 4:** `safety_permit_approvals`, `safety_permit_evidence`,
     `safety_permit_hira`, `safety_permit_loto_steps`,
     `safety_incidents`.
   - **Tier 5:** `safety_incident_evidence`, `safety_incident_progress_logs`,
     `safety_incident_timeline`, `safety_sla_escalations`,
     `safety_notifications`, `safety_audit_log`.
2. Add `safety_notifications` to `PRUNE_TABLES` with `created_at` and a
   90-day window (matches existing notification pruning policy).
3. Inventory `safety-evidence` storage bucket(s) in `STORAGE_BUCKETS` so
   the backup manifest covers Safety attachments. (Verify exact bucket
   names before merging.)
4. Restore function (`restore-backup`) must be tested to ensure the
   additional tables restore in the declared dependency order.

## Risk if not fixed before Phase 2+

- Any Phase 2 UI work that triggers a regression-driven rollback would
  not be able to recover Safety data, only PMS data.
- The "Rollback path cannot be guaranteed" Stop Condition would be
  permanently armed for every subsequent phase.

## Recommendation

Block Phase 2 sign-off until T-003 ships and a backup-restore drill
verifies recovery of at least one row from `safety_incidents`,
`safety_permits`, and `safety_audit_runs`.