---
name: Annual Review directory access
description: Who can search the "All employees" directory and add employees to a phase, with per-actor scope rules
type: feature
---
The Annual Review directory search (`search_active_employees_for_review`) and "Add to phase" write (`create_or_get_annual_review_instance`) are gated by the SQL resolver `public.annual_review_directory_access(uid)` and the client hook `useDirectoryAccess()`. Never gate on local role checks.

Access matrix (first match wins):
1. Admin or `hr_pms` role → scope `all`.
2. Active user in the HR BU (`profiles.department_id → departments.business_unit_id = org_head_config.hr_business_unit_id`) → scope `all`.
3. BU Head (`business_units.head_user_id = uid`) → scope `bu`, limited to that BU.
4. HOD (`departments.head_user_id = uid`) → scope `bu`, limited to that department's BU (covers all departments in the same BU).
5. Reporting / Skip-Level Manager (≥1 active direct report, ≥1 active skip report via two-hop chain, OR appears as `manager_id`/`skip_id` on any `annual_review_instances` row) → scope `team`, limited to that manager's direct + skip reports.
6. Otherwise → denied.

Write path re-verifies scope: BU-scoped actors cannot add employees outside their BU; team-scoped actors cannot add employees outside their reporting subtree. Audit event `annual_review.instance.auto_created` records `actor_scope` (admin/hr_pms/hr_team/bu_head/hod/reporting_manager).

UI kill-switch: `app_settings.annual_review_directory_search_enabled` still gates the directory button. The Team Annual Review route/sidebar entry must also use this resolver for HR-Team / BU-scoped visibility, not static roles alone.

Assisted self-review submission (`can_proxy_submit_annual_review` / `submit_annual_review_self_as_proxy`) honors the same resolver scope after the existing safeguards pass (`assisted_self_submission_enabled`, `pending_self`, and no employee login): HR-Team all-scope users can assist all eligible employees; BU Head / HOD users can assist only employees in their resolved BU.

See POLICY §AR-DIRECTORY-ACCESS-MATRIX.