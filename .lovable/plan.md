## Goal
Prakash Kumar Sinha (100840) reports directly to Gaurav Budhia (Management). His annual review chain today is `Self → Dept Head (Arun Goswami) → BU Head (Gaurav Budhia)`. It should be `Self → Management (Gaurav Budhia)` — no dept/BU hop.

## Risk & Impact
- **Data:** Rewriting `enabled_stages` / reviewer slots on an in-flight instance. Currently at `pending_bu` with Self + Dept Head responses already locked. Dept Head lock must be preserved as an audit artifact but should not gate advancement.
- **Workflow:** Same class of change as ADR-109 (BU-head terminal) and ADR-148 (Management backfill). Need to make sure no other employee is silently re-routed.
- **Regression:** Any employee whose reporting manager is a Management-role user (Gaurav today, others later) should get the same terminal chain. We must not accidentally strip stages for employees whose manager just happens to also carry `management` as a secondary role.
- **Mitigation:** New policy is scoped to "employee's *reporting manager* is a Management user AND employee is not themselves a BU/Dept Head". Idempotent repair with an audit row per changed instance; dry-run first.

## Policy (new — POLICY §AR-MANAGEMENT-DIRECT-REPORT-TERMINAL, ADR-154)
If `profiles.reports_to = <mgmt_user>` where `<mgmt_user>` has `user_roles.role = 'management'`, and the employee is not themselves a BU/Dept Head, then:
- `enabled_stages = ['self','management']`
- `management_id = reports_to`
- `dept_head_id = null`, `bu_head_id = null`, `skip_id = null`
- Trigger enforces this on insert/update of instance and on changes to `profiles.reports_to` / role grants.

Precedence order (top wins) — already established:
1. BU-Head-terminal (ADR-109)
2. Dept=BU collapse (ADR-137R)
3. **Management-direct-report-terminal (new)**
4. Standard chain

## Plan

1. **Diagnostic RPC** `annual_review_mgmt_direct_report_diagnostic(cycle uuid)` — list every open instance where reporting manager has `management` role but chain still contains dept/bu. Read-only preview.
2. **Repair RPC** `repair_mgmt_direct_report_terminal_chains(cycle uuid, dry_run bool)`:
   - Set `enabled_stages`, null dept/bu/skip ids, stamp `management_id`.
   - Preserve locked Self/Dept/BU responses in `annual_review_responses` (do not delete; leave as historical).
   - Recompute `overall_status`: if Self locked → `pending_management`; if nothing locked → `pending_self`; never touch `completed`.
   - Audit rows in new `annual_review_mgmt_direct_terminal_audit_2026_07`.
3. **Enforcement trigger** `tg_annual_review_apply_mgmt_direct_terminal` on `annual_review_instances` BEFORE INSERT/UPDATE — re-applies rule so cycle resets/reassigns can't regress.
4. **Cascade trigger** on `profiles` (AFTER UPDATE OF reports_to) and `user_roles` (AFTER INSERT/DELETE of role='management') — re-apply rule to affected employees' open instances.
5. **TS resolver mirror** `src/lib/annualReview/effectiveChain.ts` — add `employeeReportsToManagement` input; emit new `skipReason='mgmt_direct_terminal'` for dept_head / bu_head when true. Keeps stepper labels honest.
6. **One-shot repair** on the active cycle for Prakash Kumar Sinha (100840) + any other direct reports of Management users found by step 1. Present the list before executing (dry_run first).
7. **UI** — no new screen. Stepper will automatically show `Self → Management` after chain refresh. Admin Access Control tab gets a small "Management direct reports" diagnostic card mirroring the Terminal Integrity card from ADR-153.
8. **Docs** — ADR-154, POLICY.md §AR-MANAGEMENT-DIRECT-REPORT-TERMINAL, DOCUMENTATION.md version history bump.
9. **Tests** — unit tests for the TS resolver (new skip reason + precedence vs BU-head-terminal) and a SQL test that the trigger is idempotent and never touches `completed` rows.

## Deliverable order
Diagnostic RPC → present list → your approval → repair (dry_run then apply) → triggers + TS mirror + tests → docs.

## What I need from you before building
1. Confirm the rule scope: **only** direct reports of a Management-role user get the terminal chain (i.e. one hop, no transitive "manager's manager is Management"). Correct?
2. For instances already `completed` under the old chain, do nothing (audit-only) — OK?
3. Preserve the already-locked Dept Head response by Arun Goswami on Prakash's record as historical (not deleted), just no longer gating — OK?
