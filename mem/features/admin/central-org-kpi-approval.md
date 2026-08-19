---
name: Central Org KPI Approval
description: Per-KPI approval ladder for org_kpi_values and score propagation to mapped employees (ADR-301)
type: feature
---
Central data approval (ADR-301, POLICY §CONSOLE-CENTRAL-APPROVAL-SSOT):
- Registration: `org_kpi_central_registry` (category + KRA + KPI name, normalized). No row = KPI behaves exactly as before.
- Ladder: `org_kpi_approval_chains`, effective-dated, step 1 = provider, later steps = person (`approver_id`) or role (`approver_role`). Configured per KPI — never derived from an employee's reporting chain.
- Trail: `org_kpi_approvals`, append-only (no UPDATE/DELETE policy — do not add one).
- `org_kpi_values` workflow columns: `workflow_stage` (draft|in_approval|sent_back|approved|propagated), `current_step`, `submitted_at`, `propagation_mode`.
- RPCs only (SECURITY DEFINER, dry-run first): `org_kpi_chain_upsert`/`_list` (admin), `org_kpi_submit_value` (data owner/admin), `org_kpi_decide` (current step holder/admin; send-back needs reason and returns to the provider), `org_kpi_finalise`.
- Finalise = same value, per-employee bands: `fn_compute_rating_from_achievement(kpis, value)` per employee; frozen snapshot into `review_submissions` (POLICY §88); `final_score IS NOT NULL` skipped as `final_score_locked`.
- `central_fed` = value only (kra_set → self_review). `central_approved` = also fills empty later stages from `get_employee_workflow` and sets `kpis.status` to the last non-approved stage. Never hardcode the ladder.
