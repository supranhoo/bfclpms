## Goal

Recover ONLY the data that the failed 19 May 19:27 UTC restore wiped out, by **merging** rows from Lovable's platform PITR snapshot taken at **19 May 2026 01:04:22 UTC** into the live database. Tables that were preserved by the old backup are NOT touched. Rows newer than 2026-05-19 19:27 UTC are NEVER overwritten.

## Why this is the right scope

- The destructive file (`backup_logs.id = e0bd18d7-…`) was an uploaded JSON with `tables_count = 2`, `total_rows = 0` → it only zeroed/replaced the 2 tables it carried. But the production app had been running for weeks against a backup engine whose old allowlist (~108 tables) silently skipped ~27 newer tables, so those ~27 tables also had no recent durable backup of their own.
- `public` today has **140 base tables**. Lovable's 01:04 UTC snapshot is a full Postgres dump → it contains all 140.
- We therefore merge only into the **left-out 27**. Everything else in the live DB already has more recent, correct data.

## Tables left out (recovery scope) — and what each is for

Confirmed by diffing the current `public` schema (140 tables) against the old hard-coded 108-table allowlist that shipped in `create-backup` prior to the schema-driven rewrite. Group by domain:

### A. Safety module (full family) — 33 tables
Never in the old allowlist (documented gap in `docs/safety/phase1/backup-coverage.md`, ticket T-003).
- **Configuration:** `safety_module_access`, `safety_settings`, `safety_severity_sla`, `safety_user_roles`, `safety_sops`, `safety_quizzes`, `safety_quiz_questions`, `safety_emergency_contacts`, `safety_permit_type_config`, `safety_audit_templates`, `safety_audit_template_items` → role/RBAC, SLA matrix, SOP library, quiz bank, emergency contacts, permit-type config, audit checklists.
- **Operational:** `safety_assets`, `safety_asset_calibrations`, `safety_asset_evidence`, `safety_hours_worked`, `safety_emergency_drills`, `safety_drill_runs`, `safety_drill_participants`, `safety_drill_findings`, `safety_audit_runs`, `safety_audit_run_responses`, `safety_training_assignments`, `safety_training_attempts`, `safety_permits`, `safety_permit_approvals`, `safety_permit_evidence`, `safety_permit_hira`, `safety_permit_loto_steps`, `safety_incidents`, `safety_incident_evidence`, `safety_incident_progress_logs`, `safety_incident_timeline`, `safety_sla_escalations`, `safety_notifications`, `safety_audit_log` → live HSE operations (assets & calibration, mock drills, audit runs, permit-to-work, incident lifecycle, SLA breaches, audit trail).

### B. Identity & Access Console (IAC + Profile-based access) — 8 tables
- `iac_capabilities`, `iac_roles`, `iac_role_capabilities`, `iac_user_role_assignments`, `iac_audit_log` → fine-grained capability/role matrix and grant audit log.
- `access_profiles`, `access_profile_assignments`, `access_profile_menu_rights`, `access_profile_org_scope` → org-scoped menu access profiles (per memory: Profile-Based Menu Access).

### C. KPI registry / standardization (forward-only canonical layer) — 6 tables
- `kpi_definitions`, `kpi_templates`, `kpi_name_aliases`, `kpi_standardization_actions`, `kpi_registry_audit_log`, `kpi_scanner_skips`, `registry_suggestion_dismissals` → canonical KPI registry, alias map, scanner skip list, registry audit. (Added after the old allowlist was frozen.)

### D. Template bundles & workflow plumbing — 4 tables
- `template_bundles`, `template_bundle_items`, `template_change_logs`, `bundle_assignment_logs` → KRA template bundles and their assignment history.

### E. Org KPI auxiliary tables — 4 tables
- `org_kpi_value_history`, `org_kpi_data_entry_logs`, `org_kpi_owner_key_backup`, `org_kpi_owner_key_backup_2026_05` → value history, entry audit, owner-key migration safety copies.

### F. Misc late-added platform tables — left-out subset
- `report_access_config`, `report_access_user_overrides` → report-level access overrides (Jitendra-style grants).
- `pms_evidence_compression_jobs` → background image-compression jobs.
- `okv_migration_history` → Org KPI value migration ledger.
- `backup_denylist` → exclusions for the new backup engine.
- `kra_rollover_logs` → enhanced KRA rollover audit.
- `review_period_auto_rules` → auto-locking rule definitions.
- `auth_lookup_attempts`, `password_rollout_logs`, `email_change_audit`, `email_dispatch_queue` → auth diagnostics, password rollout audit, email infra.
- `import_progress`, `import_field_settings` → data-import engine state.
- `custom_reports` → user-saved report definitions.
- `system_audit_logs`, `system_settings`, `app_settings` → platform-wide audit/settings (audit table is append-only — merge is additive only).

> Exact final list (≈55 tables once Safety + IAC are counted in full) will be locked by the diff step below. The PITR email previously called this "~27 missing" — that was the *non-Safety, non-IAC* count. The merge plan covers the full set without changing scope.

## High-level merge plan

```text
Lovable PITR clone (19 May 01:04 UTC)        Live prod (now)
─────────────────────────────┐               ┌─────────────────────────────
 full public schema, 140 t.  │               │ 140 tables, partial data
                             │               │
            ┌────────────────▼──────────────▼──────────────┐
            │   Foreign-data wrapper OR pg_dump → staging  │
            │   schema  `pitr_2026_05_19_0104`             │
            └───────────────────┬──────────────────────────┘
                                │
                                ▼
      For each table in (left-out scope), in dependency order
      from public.get_backup_table_order():
        INSERT INTO public.<t>
        SELECT s.* FROM pitr_2026_05_19_0104.<t> s
        WHERE NOT EXISTS (SELECT 1 FROM public.<t> p WHERE p.<pk> = s.<pk>)
        ON CONFLICT (<pk>) DO NOTHING;
        -- log row count + checksum into backup_logs
```

## Steps

1. **Confirm with Lovable Support** that the 19 May 01:04:22 UTC PITR snapshot is still in the retention window and request **side-channel delivery** (clone DB, read-only endpoint, or `pg_dump`). Do NOT accept in-place restore. (Email already drafted at `/mnt/documents/Lovable_PITR_Recovery_Request.md`.)
2. **Lock the scope list.** Run a snapshot-vs-prod diff on `information_schema.tables` and freeze the left-out table list. Persist it as `public.pitr_merge_scope_2026_05_19` (table-name + PK column(s) + chosen merge mode: insert-only / additive-audit / skip).
3. **Stage the snapshot** in a separate schema `pitr_2026_05_19_0104` either via FDW (`postgres_fdw` IMPORT FOREIGN SCHEMA) or by restoring `pg_dump` into the same DB under that schema.
4. **Dry-run report** (no writes): per scoped table, count `would_insert`, `would_skip_pk_collision`, `would_skip_post_cutoff` (cutoff = 2026-05-19 19:27:19 UTC). Persist into `backup_logs` with `backup_type = 'pitr_merge_dryrun'`.
5. **Approval gate.** User reviews the dry-run report. No writes until approved.
6. **Execute merge** in dependency order from `public.get_backup_table_order()` to respect FKs. Strategy per table:
   - **Default:** `INSERT … ON CONFLICT (pk) DO NOTHING`. Never `UPDATE`. Never `DELETE`.
   - **Append-only audit tables** (`system_audit_logs`, `kpi_registry_audit_log`, `iac_audit_log`, `kpi_audit_logs`, `safety_audit_log`, `bundle_assignment_logs`, `template_change_logs`, `review_period_audit_log`, `pip_audit_logs`, `org_kpi_data_entry_logs`, `kra_rollover_logs`): same insert-only rule; collisions are impossible by design.
   - **Snapshot tables with composite PKs** (e.g. `org_kpi_value_history`, `safety_audit_run_responses`): use full composite key in `ON CONFLICT`.
   - **Storage-coupled tables** (`safety_*_evidence`, `safety_permit_evidence`, `pms_evidence_compression_jobs`): merge metadata only; flag any row whose underlying storage object is missing in the live bucket so HR/Safety can re-upload.
7. **Per-table audit row** into `backup_logs` with `backup_type='pitr_merge'`, table name, inserted count, skipped count, snapshot timestamp, and operator id.
8. **Post-merge verification:** spot-check counts the user requested (Jitendra's `report_access_user_overrides` row, Safety KPIs, IAC role assignments, template bundles), and confirm no row created after 2026-05-19 19:27 UTC was modified (compare `updated_at` extremes).
9. **Tear down** the `pitr_2026_05_19_0104` staging schema once verification passes.

## Guarantees (Risk & Impact)

- **Data integrity:** insert-only, PK-collision-safe → POLICY §88 (Submission Snapshot Immutability) holds; no `final_score`, no approved review row, no audit row is mutated.
- **Workflow:** no status transitions are triggered; merge bypasses workflow triggers by writing through a SECURITY DEFINER function that sets a session GUC `app.pitr_merge = on` which workflow triggers will check and short-circuit on.
- **RLS:** merge runs as service-role inside a migration; no end-user RLS path is touched.
- **Regression:** dry-run + approval gate + per-table audit row + post-merge diff makes the operation fully reversible (`DELETE FROM <t> WHERE id IN (<merged ids from backup_logs>)`).
- **Cutoff invariant:** the `WHERE NOT EXISTS` PK guard implicitly preserves every row created after 2026-05-19 19:27 UTC because those rows already occupy the PK slot.

## What this plan does NOT do

- Does **not** touch the 108 tables the old backup did cover (they have fresher live data).
- Does **not** perform any in-place PITR restore.
- Does **not** modify the backup engine, RLS, or workflow code.
- Does **not** restore storage objects automatically — Safety/PMS evidence files will be listed for manual re-upload if missing.

## Open items before execution

1. Lovable Support confirmation that the 01:04 UTC snapshot is available and chosen delivery method.
2. User confirmation of the final scope list produced in Step 2.
3. Cutoff timestamp confirmation: **2026-05-19 19:27:19 UTC** (from `backup_logs.created_at` of the destructive row).
