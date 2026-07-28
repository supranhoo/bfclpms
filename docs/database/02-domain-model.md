# 02 — Domain Model

Every one of the 248 tables is assigned to exactly one domain (`docs/database/data/domain_map.json`).

## 1. Org & Employee Master (19)
`profiles`, `companies`, `divisions`, `business_units`, `business_unit_sub_units`, `departments`, `designations`, `levels`, `locations`, `employment_statuses`, `employment_status_history`, `employee_categories`, `employee_master_custom_fields`, `employee_master_custom_field_values`, `employee_job_descriptions`, `employee_working_days`, `org_head_config`, `user_roles`, `modules`.

`profiles` is the employee spine. It carries `manager_id`, `functional_manager_id` (ADR-193/194), `department_id`, `company_id` and `is_active`. Business unit and division are reached transitively via `departments → business_units → divisions`; `profiles` does **not** hold `business_unit_id`.

## 2. Monthly PMS / KPI (45)
`kpis`, `kra_categories`, `kpi_definitions`, `kpi_templates`, `review_submissions`, `sub_period_submissions`, `review_periods`, `review_period_*`, `performance_reviews`, `workflow_config`, `workflow_templates`, `workflow_final_score_rules`, `org_kpi_*`, `audit_kpi_*`, `kpi_queries`, `kpi_observations`, `kpi_audit_logs`, `final_score_revisions`, `bulk_review_batches`, `pms_grades`, `frequency_config`.

`review_submissions` is the widest operational table (67 columns): one row per KPI per period, with one achieved-value / evidence / score column group per workflow stage (self, manager, functional_manager, skip_level, hr_pms, audit, management). Stage-column completeness is governed by POLICY §WF-STAGE-COLUMN-COMPLETENESS (ADR-196).

## 3. Annual Review (39)
`annual_review_cycles`, `annual_review_instances` (38 cols, the workflow state machine), `annual_review_responses` (one per reviewer stage), `annual_review_templates` / `_template_archetypes` / `_criteria_library` / `_criteria_assignments`, `annual_review_system_kpis` / `_system_kpi_weights`, `annual_review_self_review_library`, `annual_review_settings`, `annual_review_role_capabilities`, `annual_score_configs`, plus 15 dated repair/audit tables (`*_2026_07`).

## 4. Incentive & Increment (33)
`incentive_programs`, `incentive_slabs`, `incentive_production_rates`, `incentive_vessel_rates`, `employee_incentive_records`, `employee_incentive_eligibility`, `increment_runs` / `_run_items` / `_method_configs` / `_slabs`, `confirmation_increment_rules`, `general_eligibility_configs`, `production_targets`, `production_daily_entries`.

## 5. Safety / EHS (37)
`safety_incidents` (+ evidence, timeline, progress logs, routing rules), `safety_permits` (+ approvals, HIRA, LOTO steps), `safety_assets` (+ calibrations, evidence), `safety_audit_templates` / `_runs` / `_run_responses`, `safety_emergency_drills` / `_contacts`, `safety_user_roles`, `safety_module_access`, `safety_settings`, `safety_severity_sla`, `safety_sla_escalations`. Safety uses its own `safety_app_role` enum and is deliberately isolated from PMS RBAC.

## 6. Access & Security (43)
`access_profiles` + `_assignments` / `_menu_rights` / `_org_scope`, `iac_roles` / `_capabilities` / `_user_role_assignments`, `menu_registry`, `menu_access_config`, `menu_overrides`, `report_access_config`, `report_field_overrides`, `client_*` entitlement tables, `audit_policies`, `export_policies`, `retention_policies`, `data_classifications`, `privacy_consent_settings`.

## 7. Notifications & Email (5)
`notifications`, `notification_event_registry`, `email_logs`, `email_dispatch_queue`, `password_rollout_logs`.

## 8. Platform Ops / Audit / Backup (13)
`backup_logs`, `backup_denylist`, `system_audit_logs`, `okv_migration_history`, `import_progress`, `dev_report_entries`, `impl_console_rate_buckets`, plus repair-audit ledgers.

## 9. Cross-cutting (14)
`app_settings`, `system_settings`, `clients`, `sub_branches`, `custom_reports`, `report_registry`, `report_registry_v2`, `sensitive_fields`, `training_needs`, `pip_milestones`, `skill_competencies`, `template_bundles`, `template_bundle_items`, `vessel_monthly_entries`.
