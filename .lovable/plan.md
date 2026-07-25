## Goal

Make **Edit workflow & reviewers** accessible on the Annual Review Admin grid even when `overall_status = 'completed'`, so admins/HR can add a Management stage or swap a reviewer and re-run the review — without breaking any existing (pre-action / in-flight) behaviour.

## Current state (verified)

- `src/pages/annual-review/AnnualReviewAdmin.tsx` (row menu)
  - `canChange = status !== 'completed' && status !== 'excluded'`
  - `isPastSelf = canChange && status not in (not_started, pending_self)`
  - **Edit workflow & reviewers** and **Customise weights** only render when `canChange && !isPastSelf` — so both are hidden the moment the review is finalized.
- Server RPCs already support post-action edits via **supersede** mode (ADR-160):
  - `annual_review_edit_workflow(...)` accepts `p_mode = 'supersede'`, requires reason ≥10 chars, and orchestrates `set_annual_review_enabled_stages` + `reassign_annual_review_reviewer`.
  - `set_annual_review_enabled_stages(..., 'supersede')` archives locked responses for removed stages and re-computes `overall_status` via `annual_review_first_pending_status` — but does **not** check for `completed` and does **not** auto-reset scoring fields.
  - `reassign_annual_review_reviewer(..., 'supersede')` archives the locked response for the reassigned role and sets `overall_status := 'pending_<role>'` — again no `completed`-specific handling.
- `ChangeWorkflowDialog.tsx` already renders full stage toggles + reviewer pickers + supersede checkbox + `REPLAN` gate.

So the block is purely the row-menu gate; the dialog and RPCs work if we let the menu open on `completed`. But we must also make sure a re-opened Completed instance behaves like a fresh in-flight review (correct status, cleared final rating, notifications, audit).

## Scope

Frontend row-menu gate + a small, additive DB hardening path for the Completed → re-opened transition. No changes to already-working pre-action or in-flight flows.

### 1. Row menu — open on Completed (frontend)

`src/pages/annual-review/AnnualReviewAdmin.tsx`
- Extend `canChange` to also allow `overall_status === 'completed'` (still exclude `excluded`).
- Introduce `isCompleted = status === 'completed'`.
- Show **Edit workflow & reviewers** whenever `canChange` (drop the `!isPastSelf` guard for this specific item; keep it for **Change template** / **Customise weights** as-is).
- When `isCompleted`, label the item **"Edit workflow & reviewers (re-open)"** and give it the destructive style, so admins understand it re-opens a finalized review.

### 2. Dialog UX for the Completed case

`src/components/annual-review/ChangeWorkflowDialog.tsx`
- Treat `status === 'completed'` as `isPostAction = true` → `needsSupersede` is already forced true whenever the user changes anything, so the existing `REPLAN` + 10-char-reason gate applies unchanged.
- Add an amber banner at the top when `status === 'completed'`:
  > "This review is finalized. Saving will re-open it in **supersede** mode: locked responses for any removed/reassigned stage will be archived, the final rating will be cleared, and the review will move back to the appropriate pending stage."
- `computeWorkflowEditImpact` already summarizes archived/redirected stages; keep the existing impact list visible so admins see exactly what will be undone.
- No behavioural change for non-Completed instances.

### 3. Server hardening (additive, backwards-compatible)

New migration touching only the supersede branches — no signature changes.

- `set_annual_review_enabled_stages(_, _, _, 'supersede')` and `reassign_annual_review_reviewer(_, _, _, _, 'supersede')`:
  - When the current `overall_status = 'completed'`, additionally:
    - Set `final_rating = NULL`, `total_score = NULL`, `criteria_weighted_score = NULL`, `finalized_at = NULL` on the instance (fields already used elsewhere — no schema change).
    - Log an extra `annual_review_access_audit` row with action `workflow_reopened_from_completed`, metadata: `{prior_status:'completed', new_status, reason, mode}`.
    - Enqueue `annual_review.workflow_reopened` email to the employee (reuses `_ar_enqueue_email`).
  - No change for non-completed transitions.
- Keep the existing `has_admin_workflow_override = true` flag write so downstream resolvers (ADR-158 etc.) do not re-derive/strip stages against the admin edit.
- No RLS changes required: the RPCs are `SECURITY DEFINER` and already restricted to `admin`/`hr_pms`.

### 4. Documentation / policy sync

- **POLICY.md** — extend §ADR-160 with an **ADR-160c — Re-open Completed via Edit workflow & reviewers**:
  > Admins/HR may edit workflow or reviewers on a Completed annual review. This is supersede-only, requires a ≥10-char reason and `REPLAN` confirmation, archives affected locked responses, clears the finalized rating/score fields, retargets `overall_status`, sets `has_admin_workflow_override`, audit-logs `workflow_reopened_from_completed`, and notifies the employee.
- **DOCUMENTATION.md** — Annual Review Admin section: note that the row action is available on Completed rows and describe the re-open semantics.

### 5. Tests / mocks

- Unit: extend `ChangeWorkflowDialog` render test to assert:
  - On `overall_status = 'completed'`, the dialog opens, the re-open banner renders, `needsSupersede` is true, Save is blocked until `REPLAN` + ≥10-char reason.
- Unit for `computeWorkflowEditImpact`: add a `completed` fixture confirming the impact list flags "final rating will be cleared".
- SQL smoke (via existing repo test harness): supersede-edit on a completed instance clears `final_rating`, sets `overall_status` to the correct pending stage, archives locked responses for the removed/reassigned role, and inserts the `workflow_reopened_from_completed` audit row.

## Risk & Impact

- **Data**: Additive — only the supersede branch clears finalized fields, and only when the caller supplies a supersede reason + `REPLAN` confirmation. Old responses go to the existing archive path (no destructive delete).
- **Workflow**: Existing pre-action / in-flight edit paths untouched. Completed → re-opened uses the same resolver that already handles fresh workflows.
- **UI/UX**: One new menu entry variant + one amber banner; no layout changes.
- **Regression**: Low. The dialog already exercises supersede for other post-action statuses (e.g. `pending_bu`, `pending_hr`); Completed just becomes another supersede-required status.
- **Rollback**: Frontend revert restores the old gate; DB migration is idempotent `CREATE OR REPLACE` and can be reverted by re-issuing the prior function bodies.

## Non-goals

- No change to Change template / Customise weights gating.
- No auto-recompute of scores on re-open — the re-opened stage owner re-submits, and the standard advancement path recomputes totals on next completion.
