## Goal

Make **Admin → Edit workflow & reviewers** work at **any stage** of the annual review — before start, mid-flow, or after completion — and let it **force a reviewer change at any time** without leaving the instance stuck, mis-attributed, or silently reverted by another trigger.

## Status recap

Core plumbing for ADR-160 already shipped last turn (migration + service + dialog). What follows is the **complete** plan so remaining hardening, notifications, tests, and docs land explicitly.

| Piece | State |
|---|---|
| `has_admin_workflow_override` marker column | Done |
| `set_annual_review_enabled_stages(..., p_mode)` with archive on removed stages | Done |
| `reassign_annual_review_reviewer(..., p_mode)` with locked-response archive + status rewind + in-app notification | Done |
| `annual_review_edit_workflow` orchestrator RPC | Done |
| Normalisation triggers (`bu_head_terminal`, `collapsed_dept_bu`, `missing_dept_head_strip`, `management_terminal`) honour override flag | Done |
| Admin dialog: post-action edits allowed, impact warning, "REPLAN" typed confirmation, single-RPC submit | Done |
| Email dispatch (`email_dispatch_queue`) for new/old reviewer & employee | **Pending** |
| Bulk audit summary row + explicit "reason" length rule (min 10 chars) for post-action edits | **Pending** |
| Impact preview showing exact locked responses (not just role names) | **Pending** |
| POLICY.md §AR-WORKFLOW-EDIT-ANYTIME + DOCUMENTATION.md ADR-160 | **Pending** |
| Vitest unit tests (impact calculator, service contract) | **Pending** |

## Failure scenarios the plan must cover (unchanged from prior plan)

1. Reviewer swap before anyone acted — trivial; keep working.
2. Reviewer swap while a stage has an unlocked draft — rebind trigger handles.
3. Reviewer swap on a stage with a locked response — admin picks *supersede & rewind* or *redirect only*.
4. Reviewer swap on a stage already behind current status — supersede rewinds status.
5. Add a stage after action — insert at correct seniority; recompute pending.
6. Remove an already-actioned stage — archive locked response, recompute totals, recompute status.
7. Remove Self after employee submitted — same as (6); archived to `annual_review_reset_archive`.
8. Instance already `completed` — reopen path via supersede + typed confirmation.
9. Cycle closed — reject with clear message.
10. Normalisation triggers reverting the admin's change — all four triggers now short-circuit on `has_admin_workflow_override`.
11. Notifications — in-app done; email + old-reviewer + employee notice pending.
12. RLS on new reviewer's queue — verified via `_id = auth.uid()` slot policies.
13. Audit trail — `annual_review_access_audit` (`workflow_edited_post_action`, `reviewer_reassigned_supersede`) + `annual_review_reset_archive` + `system_audit_logs`.
14. Concurrency — `SELECT … FOR UPDATE` inside the RPC.
15. Client-side validation — impact preview + typed confirmation + reason min 3 chars.

## Remaining work — detailed

### 1. Email dispatch (backend)

Extend `reassign_annual_review_reviewer` and `set_annual_review_enabled_stages` to enqueue rows in `public.email_dispatch_queue` (already used by other annual-review flows):

- **New reviewer** — template `annual_review.reviewer_assigned`.
- **Old reviewer** (only in `supersede` mode when their locked response was archived) — template `annual_review.reviewer_removed`.
- **Employee** — template `annual_review.workflow_changed` when Self stage is added/removed OR terminal stage changes.

Wrap each insert in `BEGIN … EXCEPTION WHEN OTHERS THEN NULL; END;` so a mail failure never blocks the data change (mirrors ADR-133).

### 2. Enhanced audit summary

Add a single `workflow_edited_post_action` row from the **orchestrator** summarising the whole request (stages added/removed + all reviewer changes + mode + prior/new status) so admins can review one canonical entry instead of correlating multiple stage/reviewer rows. Existing per-operation rows remain for granular history.

### 3. Post-action reason rule

Bump minimum reason length to 10 chars when `p_mode = 'supersede'`. Under 10 chars the RPC raises a helpful message; the dialog reflects the same threshold.

### 4. Frontend impact preview

- Add `useInstanceLockedResponses(instanceId)` hook returning `[{ role, reviewer_name, submitted_at }]`.
- Replace the current warning list with a table: for each removed stage or reassigned stage, show "**Manager (Rakesh, submitted 12 Jul)** — will be archived".
- Show status rewind arrow: `Completed → BU Head Review Pending`.
- Keep the typed-`REPLAN` confirmation gate.

### 5. Tests

- `src/test/workflowEditImpact.test.ts` — pure calculator: given (currentStages, currentStatus, currentSlots, nextStages, reviewerPicks) → `{ archives, rewindTo, notifications }`.
- `src/test/editWorkflowRpc.contract.test.ts` — mocks the supabase client, asserts orchestrator arguments for each mode.

### 6. Docs

- `src/modules/annual-review/POLICY.md` → **§AR-WORKFLOW-EDIT-ANYTIME (ADR-160)** with the rules above.
- `src/modules/annual-review/DOCUMENTATION.md` → ADR-160 entry + version bump.

## Files to touch (remaining)

Migration (`ADR-160b`):
1. Extend the two RPCs and orchestrator with:
   - email-queue inserts (guarded);
   - min-10-char reason in supersede mode;
   - orchestrator writes a single summary `workflow_edited_post_action` audit row.

Code:
- `src/hooks/annualReview/useInstanceLockedResponses.ts` — new.
- `src/lib/annualReview/workflowEditImpact.ts` — new pure calculator.
- `src/components/annual-review/ChangeWorkflowDialog.tsx` — replace warning block with a proper impact table using the hook + calculator.
- `src/test/workflowEditImpact.test.ts` — new.
- `src/test/editWorkflowRpc.contract.test.ts` — new.

Docs:
- `src/modules/annual-review/POLICY.md`, `src/modules/annual-review/DOCUMENTATION.md` — new section + ADR entry.

## Risk & impact

- **Data**: additive column + additive arguments; existing callers unaffected. Archive is non-destructive (`annual_review_reset_archive` retains full row).
- **Workflow**: post-action edits admin/HR-only; other RPCs unchanged.
- **UI**: dialog gains a preview table; destructive edits stay behind the typed confirmation.
- **Regression**: normalisation triggers now honour explicit overrides — mitigated by RPC re-validating `annual_review_first_pending_status`.
- **Scalability**: single-instance operations, bounded work.

## Rollback

- Migration is reversible: drop the new column + revert the RPC bodies + revert trigger heads.
- Archived rows in `annual_review_reset_archive` allow full response restoration (helper pattern already exists from ADR-155/159).

## Not applicable

- Pagination — instance-scoped.
- New RLS — reuses existing role/slot policies.
