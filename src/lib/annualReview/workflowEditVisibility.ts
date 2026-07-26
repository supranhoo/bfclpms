/**
 * POLICY §AR-WORKFLOW-EDIT-ANYTIME (ADR-160 / 160b / 160c / 160d).
 *
 * SSOT for whether the Admin → Progress row action
 * "Edit workflow & reviewers" is offered for an instance.
 *
 * The ONLY status gate is `excluded`. Every other status — including every
 * mid-workflow `pending_*` and `completed` (which re-opens via supersede) —
 * must expose the action; the server RPCs enforce role, mode and audit rules.
 *
 * ADR-160d regression note: this predicate must NOT be conflated with the
 * template-reset gate (`isPastSelf`), which exists only because swapping a
 * template discards the self review. Reusing it here silently hid the action
 * for every instance past self-review.
 */
export function canEditWorkflowAndReviewers(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return status !== 'excluded';
}

/** True when opening the dialog will re-open a finalized review (destructive). */
export function workflowEditReopensCompleted(
  status: string | null | undefined,
): boolean {
  return status === 'completed';
}