## Goal
For cycle **Annual Review - 2025-2026** (`b82a935f-05a3-4a18-a65c-215d2ef16c4c`), set every employee's workflow to **Self → Dept Head → BU Head** (3 stages, dropping Manager, Skip Manager, and HR).

## Current State
- 2,653 instances, all `overall_status = pending_self` (pre-start, safe to modify).
- 2,651 currently on the 6-stage default `[self, manager, skip_manager, dept_head, bu_head, hr]`.
- 2 already narrowed (1 has HR, 1 already matches target).
- Only 12 response rows exist in the cycle — but since every instance is still `pending_self`, the `enabled_stages` trigger + RPC contract allow the change.

## Risk & Impact
- **Data**: Changes `enabled_stages` on ~2,652 rows. `enabled_stages` is preserved by the seeder (per memory), so a re-seed won't undo this. No response data is touched.
- **Workflow**: Manager / Skip Manager / HR reviewers lose visibility of these instances. Confirm this is intended for **all** employees in the cycle.
- **UI**: Stepper collapses from 6 circles to 3 (Self → Dept Head → BU Head). `overall_status` stays `pending_self` — Self is still the first stage.
- **Regression**: Validation trigger `tg_annual_review_validate_enabled_stages` enforces subset + non-empty; new chain passes.
- **Audit**: Each change is logged as `annual_review.enabled_stages_set` with previous, new, reason.
- **Rollback**: Single UPDATE restoring `["self","manager","skip_manager","dept_head","bu_head","hr"]` for the cycle (script kept in migration comment).

## Plan

1. **Bulk update via SQL** (through the insert tool, since this is data, not schema):
   - `UPDATE annual_review_instances SET enabled_stages = '["self","dept_head","bu_head"]'::jsonb WHERE cycle_id = 'b82a935f-…' AND enabled_stages <> '["self","dept_head","bu_head"]'::jsonb;`
   - Trigger validates each row automatically.
2. **Insert matching audit rows** into `system_audit_logs` (or the annual-review audit table used by the RPC) with action `annual_review.enabled_stages_set`, reason `"Bulk cycle-wide workflow change: Self → Dept Head → BU Head"`, previous + new payloads, so the change is traceable exactly like the RPC path.
3. **Verify**: re-run `SELECT enabled_stages, count(*) …` — expect a single row `["self","dept_head","bu_head"] = 2653`.
4. **Docs**: append entry to `DOCUMENTATION.md` Version History and `POLICY.md` (per SSOT rule) noting the cycle-scoped workflow override.

## Confirmations Needed
- Apply to **every** employee in the cycle (no department/role exception)? Assumed **yes** per your message.
- Keep the 1 instance already on `[self, dept_head, bu_head, hr]` — should HR be dropped from it too? Assumed **yes** (uniform target).

Reply "go" to execute, or tell me which employees to exclude.
