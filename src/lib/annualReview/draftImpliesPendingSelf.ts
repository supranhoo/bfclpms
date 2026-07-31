/**
 * ADR-211 / POLICY §AR-DRAFT-IMPLIES-PENDING-SELF
 *
 * Client-side mirror of the PL/pgSQL trigger
 * `public.ar_draft_implies_pending_self()` on `annual_review_responses`.
 * An instance that holds a self-review draft must never remain at
 * `not_started` — the employee's own page renders as "Not Started" and the
 * review is invisible in every pending queue.
 *
 * The database is the authority; this module exists so the UI (and tests) can
 * reason about the same invariant. Pure functions only.
 */

export interface SelfDraftSignal {
  reviewer_role: string;
  /** A saved draft has not been submitted/locked yet — still a draft. */
  is_locked?: boolean | null;
}

/** True when at least one self response row exists for the instance. */
export function hasSelfResponse(responses: readonly SelfDraftSignal[]): boolean {
  return responses.some(r => r.reviewer_role === 'self');
}

/**
 * The invariant: a self response + `not_started` is a defect.
 * Returns the status the instance should carry, or the current one unchanged.
 */
export function resolveStatusForSelfDraft(
  currentStatus: string,
  responses: readonly SelfDraftSignal[],
): string {
  if (currentStatus !== 'not_started') return currentStatus;
  return hasSelfResponse(responses) ? 'pending_self' : currentStatus;
}

/** Diagnostic helper — flags instances violating the invariant. */
export function violatesDraftInvariant(
  currentStatus: string,
  responses: readonly SelfDraftSignal[],
): boolean {
  return resolveStatusForSelfDraft(currentStatus, responses) !== currentStatus;
}