
## Goal

Create a detailed, ready-to-send email to Lovable Support requesting a **Point-in-Time-Recovery (PITR) snapshot** of the production database for project `jdvsvqiyptijplyhmqqn`, scoped to the tables that lost data during the 19 May 2026 19:27 UTC backup-restore. Save it as a downloadable artifact — no code or DB changes.

## Deliverable

A single Markdown file at `/mnt/documents/Lovable_PITR_Recovery_Request.md` containing the full email below. Nothing else changes.

---

## Email Content (verbatim, ready to copy/paste)

**Subject:** Urgent — Request for Point-in-Time-Recovery (PITR) Snapshot Restore — Data Loss After Backup-Restore (Project `jdvsvqiyptijplyhmqqn`)

**To:** Lovable Support / Lovable Cloud Infrastructure Team
**Lovable Project ID:** `6d6d219b-95a7-46cf-993c-80fb5b9f5fbd`
**Cloud Project Ref:** `jdvsvqiyptijplyhmqqn`
**Published URL:** https://bfclpms.lovable.app · **Custom Domain:** https://pms.bfclalloys.com
**Severity:** P1 — production data loss

### 1. Executive Summary
On **19 May 2026 ~19:27 UTC** a backup-restore was performed against our production DB. The backup file was produced by an **earlier version of our in-app backup engine that only enumerated 108 tables**, while `public` currently has **~140 base tables**. As a result, every table in `public` today that was NOT in the old 108-table allowlist was effectively wiped / not restored. Evidence: `public.backup_logs` row `e0bd18d7-f458-427e-ba46-b697c96b7ec9`, `backup_type='uploaded'`, `created_at=2026-05-19 19:27:19.091838+00`, `tables_count=2`, `total_rows=0`.

We have since patched the backup engine to be schema-driven (`public.get_backup_table_order()` + `public.backup_denylist`) with a shrink-guard, so recurrence is prevented. We now need help recovering the rows that were lost on 19 May.

### 2. Recovery Window
- **Target PITR timestamp:** 2026-05-19 **19:20:00 UTC** (≈7 min before the destructive restore).
- **Acceptable window:** 2026-05-19 18:00 → 19:25 UTC.
- **Restore mode:** **Side-channel / clone restore only** — please deliver the snapshot as a separate database, temporary read-only endpoint, or downloadable `pg_dump`. An in-place restore would erase ~1 day of legitimate writes already made since 19 May (new review-cycle rows, 177 carry-forward `workflow_config` rows from migration `20260520054855_*`, observations, queries, notifications, audit logs, etc.).

### 3. Why Not In-Place
Significant legitimate writes since 19 May 19:27 UTC exist in: `performance_reviews`, `review_submissions`, `sub_period_submissions`, `workflow_config`, `kpi_observations`, `kpi_queries`, `kpi_rollback_requests`, `notifications`, `email_dispatch_queue`, `system_audit_logs`, `pip_*`, `safety_*`, `backup_logs`, `backup_denylist`, `kra_rollover_logs`, registry tables. We must merge, not overwrite.

### 4. Tables to Recover
Please restore all rows as of the target timestamp for the tables in `public` that were NOT in the old 108-table allowlist. If easier, **restore the entire `public` schema into the clone** and we will perform the selective merge ourselves.

High-priority candidates (non-exhaustive):
- KPI registry & audit: `kpi_definitions`, `kpi_templates`, `kpi_name_aliases`, `kpi_standardization_actions`, `kpi_registry_audit_log`, `kpi_scanner_skips`, `registry_suggestion_dismissals`, `kpi_audit_logs`, `kpi_observations`, `kpi_observation_replies`, `kpi_mention_access`, `kpi_queries`, `kpi_rollback_requests`
- Org KPI: `org_kpi_value_history`, `org_kpi_data_owners`, `org_kpi_data_entry_logs`, `org_kpi_owner_key_backup`, `org_kpi_owner_key_backup_2026_05`, `audit_kpi_assignments`, `audit_kpi_level_assignments`
- Templates & workflow: `template_bundles`, `template_bundle_items`, `template_change_logs`, `bundle_assignment_logs`, `workflow_templates`, `workflow_settings`, `workflow_config`
- Review cycle: `review_periods`, `review_period_stages`, `review_period_locks`, `review_period_audit_log`, `review_period_auto_rules`, `review_submissions`, `review_action_notes`, `sub_period_submissions`, `performance_reviews`, `performance_improvement_plans`, `pip_milestones`, `pip_audit_logs`, `training_needs`, `frequency_config`, `employee_working_days`, `kra_categories`, `kra_rollover_logs`
- Incentive engine: `incentive_programs`, `incentive_program_mappings`, `incentive_program_types`, `incentive_program_custom_tabs`, `incentive_custom_tab_data`, `incentive_slabs`, `incentive_slab_categories`, `incentive_allocation_rules`, `incentive_eligibility_fields`, `incentive_disqualification_rules`, `incentive_production_rates`, `incentive_vessel_rates`, `incentive_score_revisions`, `employee_incentive_eligibility`, `employee_incentive_records`, `vessel_monthly_entries`, `production_daily_entries`, `production_targets`
- Safety (full family): `safety_audit_runs`, `safety_audit_run_responses`, `safety_audit_templates`, `safety_audit_template_items`, `safety_audit_log`, `safety_assets`, `safety_asset_calibrations`, `safety_asset_evidence`, `safety_incidents`, `safety_incident_evidence`, `safety_incident_progress_logs`, `safety_incident_timeline`, `safety_emergency_drills`, `safety_emergency_contacts`, `safety_drill_runs`, `safety_drill_participants`, `safety_drill_findings`, `safety_permits`, `safety_permit_approvals`, `safety_permit_evidence`, `safety_permit_hira`, `safety_permit_loto_steps`, `safety_permit_type_config`, `safety_quizzes`, `safety_quiz_questions`, `safety_training_assignments`, `safety_training_attempts`, `safety_sops`, `safety_severity_sla`, `safety_sla_escalations`, `safety_hours_worked`, `safety_module_access`, `safety_notifications`, `safety_settings`, `safety_user_roles`
- Access control: `iac_capabilities`, `iac_roles`, `iac_role_capabilities`, `iac_user_role_assignments`, `iac_audit_log`, `access_profiles`, `access_profile_assignments`, `access_profile_menu_rights`, `access_profile_org_scope`, `menu_access_config`, `menu_access_user_overrides`, `report_access_config`, `report_access_user_overrides`
- Org master: `companies`, `business_units`, `business_unit_sub_units`, `divisions`, `sub_branches`, `locations`, `departments`, `designations`, `levels`, `pms_grades`, `skill_competencies`, `employee_job_descriptions`
- Platform: `email_logs`, `email_dispatch_queue`, `email_change_audit`, `notifications`, `system_audit_logs`, `system_settings`, `app_settings`, `password_rollout_logs`, `auth_lookup_attempts`, `import_progress`, `import_field_settings`, `custom_reports`, `pms_evidence_compression_jobs`, `okv_migration_history`, `modules`, `profiles`, `user_roles`

### 5. Our Merge Plan (no action needed from Lovable)
1. Diff each affected table snapshot-vs-prod on PK.
2. `INSERT … ON CONFLICT DO NOTHING` missing rows in dependency order via our `public.get_backup_table_order()` topology.
3. Log the recovery into `public.backup_logs` for audit.
4. Touch no row created after 2026-05-19 19:27 UTC.

### 6. Action Items Requested
1. Confirm a PITR snapshot is available in the 18:00–19:25 UTC window on 19 May 2026.
2. Confirm delivery method (clone DB preferred, else `pg_dump` download or read-only endpoint).
3. Provide credentials / link.
4. Confirm retention window for the clone (we estimate 5 business days for the merge).
5. Quote any cost / plan-tier implications before proceeding.

### 7. Contact
- Primary: BFCL Alloys — PMS Application Owner
- Email / phone: *(fill in before sending)*
- Preferred response: ASAP — Admin, HR PMS, Auditors and Managers are blocked on missing master data and historical KPI evidence.

Thank you.

---

## Steps on Approval
1. Write the above content verbatim to `/mnt/documents/Lovable_PITR_Recovery_Request.md`.
2. Surface it as a `<presentation-artifact>` so it can be downloaded and forwarded to Lovable support.

No source code, no migrations, no DB changes.
