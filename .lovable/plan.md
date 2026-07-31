## Assumptions

"Make this pending self" = set Kumar Ambarish's annual review to **Self Review Pending** so he can open and submit his own form.

## Verified current state (read-only queries, no writes)

- Employee: Kumar Ambarish, `102014`, active, profile `ff680ae9…`.
- Instance `b5428dbe…` in cycle `b82a935f…`: `overall_status = not_started`, `enabled_stages = [self, dept_head, bu_head]`, template `af2a2c7c…`.
- One `annual_review_responses` row already exists: `reviewer_role = self`, `is_locked = false`, `submitted_at = NULL`, with 5 criteria scores at 4 and qualitative answers — i.e. an **unsubmitted self draft**.
- Cycle distribution: 2078 completed, 492 excluded, 7 pending_bu, 1 pending_dept, 1 pending_self, and this single `not_started` row — so this is a one-off straggler, not a systemic bug.

Note: because a self draft exists but the instance never left `not_started`, the likely cause is that the draft was saved without the status advancing. That diagnosis is unconfirmed; step 1 below checks it before anything else.

## Steps

1. **Pre-flight reads** — confirm no reset-archive row or exclusion record for this instance, confirm the `self` stage is enabled (already seen), and check whether any trigger sets `not_started → pending_self` on draft save (to see if this is a repeatable gap or a one-off).
2. **Data change (single row, not a schema migration)** — set `overall_status = 'pending_self'` on instance `b5428dbe…`. Leave the existing draft response, template, reviewer mappings and `enabled_stages` untouched.
3. **Trigger check** — `not_started → pending_self` is a forward move, so the downstream-rewind guard (ADR-184) and the stage-score guard (ADR-172, submission-time only) do not apply. No bypass flag needed.
4. **Audit trail** — write a before/after snapshot row into the dated repair table `annual_review_status_repair_2026_07` (instance id, employee, prior/new status, reason, `performed_by = NULL` for a system-run repair), consistent with ADR-183/185 practice.
5. **Verification** — re-read the instance; confirm status `pending_self`, the draft still present and unlocked, and that the employee's own annual review page renders as editable rather than "Not Started".
6. **Docs/policy sync** — if step 1 shows the draft-save path can leave an instance at `not_started`, record it as a small ADR + POLICY note (`§AR-DRAFT-IMPLIES-PENDING-SELF`) and add a guard so saving a self draft always advances `not_started → pending_self`. If it turns out to be a one-off from a manual/bulk action, document it as a data repair only.
7. **Regression test** — extend the annual-review status tests with the "self draft exists ⇒ status must not be `not_started`" invariant.

## Risk & impact

- **Data impact**: one status field on one row, plus one audit row. Additive, no schema change.
- **Workflow impact**: the review enters the employee's own queue; downstream Dept Head / BU Head stages unchanged.
- **UI impact**: the grid chip for 102014 changes from grey "Not Started" to "Self Review Pending"; his review page becomes editable.
- **Regression risk**: very low — scoped to a single instance id; no shared function or trigger changes unless step 6 finds a real gap.
- **Rollback**: set `overall_status` back to `not_started`; the audit row holds the exact before-state.
