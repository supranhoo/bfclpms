## Goal

Make **Admin → Edit workflow & reviewers** work at **any stage** of the annual review — before start, mid-flow, or after completion — and let it **force a reviewer change at any time** without leaving the instance stuck, mis-attributed, or silently reverted by another trigger.

## Current state (verified from DB + code)

| Piece | Behaviour today | Gap |
|---|---|---|
| `reassign_annual_review_reviewer` RPC | Admin/HR only; upserts `annual_review_assignment_overrides`, updates the slot `_id`, writes `system_audit_logs`. No status gate. | Doesn't archive a prior **locked** response, doesn't rewind status back to that stage, doesn't notify the new reviewer, and downstream normalisation triggers can undo the change. |
| `set_annual_review_enabled_stages` RPC | Hard block: `IF v_status NOT IN ('not_started','pending_self') AND v_has_responses THEN RAISE 'cannot change workflow after review has been actioned'`. | The user wants the toggle to work after action too. Removed stages currently orphan locked responses. |
| Rebind trigger `enforce_ar_reviewer_response_rebind` | Rebinds unlocked drafts to new reviewer; leaves locked rows alone. | No pathway to invalidate a locked response when admin explicitly wants a fresh review by the replacement reviewer. |
| Normalisation triggers `enforce_bu_head_terminal_stage`, `enforce_management_terminal_stage`, `enforce_collapsed_dept_bu_normalise`, `enforce_missing_dept_head_stage_strip` | Rewrite `enabled_stages` on every save. Only `enforce_management_terminal_stage` (ADR-157) honours admin overrides. | Others silently strip stages the admin just added/kept. |
| Completion guard `tg_annual_review_guard_completion` (ADR-127b) | Blocks `completed` when the terminal stage has no locked response. | Correct today, but a mid-flow reviewer change without state rewind will trip it. |
| UI `ChangeWorkflowDialog` | Toggle stages + pick reviewer per enabled stage + reason. Only rejected server-side. | No impact preview, no destructive-action confirmation, no post-action allowance, no rewind option. |

## Failure scenarios the plan must cover

1. **Reviewer swap before anyone acted** — trivial today; keep working.
2. **Reviewer swap while a stage has an unlocked draft** — rebind to new reviewer (already handled), add audit toast.
3. **Reviewer swap on a stage that has a locked response** — admin picks between (a) *supersede & rewind* (archive locked row, revert status to `pending_<stage>`, notify new reviewer) or (b) *keep history, redirect future only* (leave row, just change slot; status stays).
4. **Reviewer swap on a stage that is already behind current status** — same choice as (3), plus cascade-clear later locked rows if admin chooses full rewind.
5. **Add a new stage after action** — insert into `enabled_stages` at the correct seniority slot; if the added stage is *before* the current status, rewind to it, archive intermediate locks (with explicit "clear intermediate reviews" checkbox); if *after*, simply add and let the flow reach it.
6. **Remove an already-actioned stage** — archive that stage's response into `annual_review_reset_archive`, delete the response, recompute totals, snap status to the next enabled pending stage.
7. **Remove Self stage after employee already submitted** — treat same as (6); flag on `is_locked` triggers manual archive path.
8. **Instance already `completed`** — allow "Reopen & edit workflow" that reverts status to the earliest affected pending stage, archives responses past that point, and requires a stronger typed confirmation.
9. **Cycle closed** — reject with a clear message; do not offer the dialog.
10. **Normalisation triggers reverting the admin's change** — every collapse/terminal trigger must honour an explicit override row in `annual_review_assignment_overrides` **and** a new marker on `enabled_stages`.
11. **Notifications** — email + in-app to (a) new reviewer, (b) previous reviewer (informational), (c) employee if their self stage changed.
12. **RLS on the new reviewer's queue** — swap must make the instance visible to the new reviewer immediately; verified via `get_my_annual_review_queue` after the change.
13. **Audit** — every action recorded in `annual_review_access_audit` (`workflow_edited`, `reviewer_reassigned_supersede`) plus `annual_review_reset_archive` for any archived response.
14. **Concurrency** — RPC uses `FOR UPDATE` on the instance row; UI mutation refetches queue on success; conflict caught with clear toast.
15. **Client-side validation** — dialog must (a) show current status + who has locked, (b) preview exact effect ("Will archive 2 locked responses and rewind to Manager"), (c) require reason, (d) require typed **"REPLAN"** confirmation for destructive scenarios.

## Design

### 1. New allow-list column on the audit constraint

Extend `annual_review_access_audit_action_check` with two new actions: `workflow_edited_post_action`, `reviewer_reassigned_supersede`.

### 2. Extend `set_annual_review_enabled_stages` RPC

- Drop the hard status gate. Instead accept a new argument `p_mode text` in `('safe','supersede')`.
- `safe` = current behaviour (only if no responses or pre-`pending_self`).
- `supersede` = allowed at any status:
  - For every stage being removed with a locked response → archive it into `annual_review_reset_archive` (`reason = 'ADR-160: admin workflow edit'`) and delete the response.
  - Recompute `total_score`, `criteria_weighted_score`.
  - Recompute `overall_status = annual_review_first_pending_status(new_stages)` clamped so we never move past a stage that still has a locked response.
  - Set a new boolean `has_admin_workflow_override` (add column) on the instance so normalisation triggers respect it.
  - Write one `annual_review_access_audit` row per removed stage + one summary row.

### 3. Extend `reassign_annual_review_reviewer` RPC

- Add `p_mode text` in `('redirect','supersede')`.
- `redirect` = current behaviour (rebind drafts, keep locked history, do not rewind).
- `supersede` = archive the locked response for that stage (into `annual_review_reset_archive`), delete the response, rewind `overall_status` to `pending_<stage>` if the instance was at or past that stage, and set `has_admin_workflow_override = true`.
- After either mode, enqueue notification to the new reviewer via existing `email_dispatch_queue` + `notifications` insert.

### 4. Normalisation-trigger fix (preventive)

- Add `has_admin_workflow_override boolean NOT NULL DEFAULT false` to `annual_review_instances`.
- Update `enforce_bu_head_terminal_stage`, `enforce_collapsed_dept_bu_normalise`, `enforce_missing_dept_head_stage_strip` to `RETURN NEW` unchanged when `NEW.has_admin_workflow_override = true`. `enforce_management_terminal_stage` already honours overrides but will also check this flag.

### 5. UI — enhanced `ChangeWorkflowDialog`

New sections layered on the existing dialog (no destructive UX regression):

1. **Status banner** — current status, terminal stage, count of locked responses.
2. **Stages** — same toggles, but each row now shows a badge: `Locked (Manager: Rakesh, 12 Jul)` or `Draft` or `Empty`.
3. **Reviewers** — same picker, plus a "**Supersede locked response**" checkbox that appears only when a locked response exists for that stage.
4. **Impact preview** — auto-computed list: "Will archive 1 locked BU Head response by Sindhu and rewind status from Completed → BU Head Review Pending. New reviewer Gaurav will receive an email + in-app notification."
5. **Reason** (required, min 10 chars for post-action edits).
6. **Typed confirmation** — "Type REPLAN to confirm" appears only when the impact preview contains any *archive* or *rewind*.
7. On submit, single call to a new orchestrator RPC `annual_review_edit_workflow(instance_id, new_stages, reviewer_overrides jsonb, mode, reason)` that performs stage + reviewer changes inside one transaction to prevent partial states.

### 6. Notifications

Reuse `email_dispatch_queue` and the in-app `notifications` table. Templates:

- `annual_review.reviewer_assigned` → new reviewer, "You have a new annual review to complete for X".
- `annual_review.reviewer_removed` → old reviewer (informational, only if their response was archived).
- `annual_review.workflow_changed` → employee, when Self stage or terminal stage changed.

### 7. RLS

No new policies required — swapping `manager_id`/`bu_head_id`/etc. is already visible to the new user via existing `_id = auth.uid()` clauses. Add a Playwright smoke test after the migration.

### 8. Audit tables

- `annual_review_access_audit` — one row per orchestrator call summarising `{added: [...], removed: [...], reassigned: [...], superseded: [...]}`.
- `annual_review_reset_archive` — one row per archived response with `reason='ADR-160'`.
- `annual_review_reviewer_resync_audit` — already written by the rebind trigger.

## Files to change

Migration (`ADR-160`):

1. `ALTER TABLE annual_review_instances ADD COLUMN has_admin_workflow_override boolean NOT NULL DEFAULT false`.
2. Extend `annual_review_access_audit_action_check` with new actions.
3. Replace `set_annual_review_enabled_stages` (add `p_mode`, archive/recompute logic).
4. Replace `reassign_annual_review_reviewer` (add `p_mode`, archive/rewind logic, enqueue notification).
5. New RPC `annual_review_edit_workflow(uuid, jsonb, jsonb, text, text)` — orchestrator.
6. Patch normalisation triggers to short-circuit on `has_admin_workflow_override`.
7. Notification enqueue helper `enqueue_annual_review_reviewer_change_notice(instance_id, role, old_reviewer, new_reviewer)`.

Code (frontend):

- `src/services/annualReview/annualReviewService.ts` — new `editWorkflow(...)` calling the orchestrator; keep `setEnabledStages` / `reassignReviewer` as thin wrappers.
- `src/hooks/annualReview/useInstanceLockedResponses.ts` — small hook to fetch locked-response summary per instance for impact preview.
- `src/components/annual-review/ChangeWorkflowDialog.tsx` — new sections (status banner, stage locks badge, per-stage "Supersede" checkbox, impact preview, typed confirmation, single-RPC submit).
- `src/lib/annualReview/workflowEditImpact.ts` — pure function computing the impact preview; unit tested.
- `src/test/workflowEditImpact.test.ts` and `src/test/editWorkflowRpc.contract.test.ts`.

Docs:

- `src/modules/annual-review/POLICY.md` — new §AR-WORKFLOW-EDIT-ANYTIME.
- `src/modules/annual-review/DOCUMENTATION.md` — ADR-160 entry + version history bump.

## Risk & impact

- **Data**: additive column + additive RPC arguments; existing callers (`safe`/`redirect` default) unaffected. Archive path is non-destructive (row preserved in `annual_review_reset_archive`).
- **Workflow**: post-action stage/reviewer edits now possible only for admin/HR via the orchestrator RPC; other RPCs unchanged.
- **UI**: dialog gains sections; existing happy-path flows keep working; destructive edits are gated behind a typed confirmation.
- **Regression**: normalisation triggers now honour explicit overrides — theoretically could leave a truly-invalid chain in place. Mitigation: dialog validates chain locally *and* the RPC re-runs `annual_review_first_pending_status` and rejects chains with 0 enabled stages.
- **Scalability**: single-instance operations, bounded work; no full-table scans.

## Rollback

- Migration is reversible: `DROP COLUMN has_admin_workflow_override`, restore prior RPC bodies from prior migration files, revert triggers. No data loss because archived rows sit in `annual_review_reset_archive` and can be re-materialised if needed (helper already exists per ADR-155/159 pattern).

## Not applicable

- Pagination — instance-scoped operation.
- New RLS — reuses existing role/slot policies.
