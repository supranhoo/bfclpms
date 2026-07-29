import type { AnnualReviewStatus, AnnualReviewerRole } from '@/types/annualReview';

/**
 * ADR-200 / POLICY §AR-STAGE-REVERT-NO-DEAD-END.
 *
 * TypeScript mirror of `public.annual_review_reanchor_status(jsonb, annual_review_status)`.
 *
 * When `enabled_stages` is contracted (dedup, BU-head-terminal normalisation,
 * admin workflow edit) the instance status may end up pointing at a stage that
 * is no longer enabled — a dead end: the UI routes the reviewer to that form
 * and `advance_annual_review_status` rejects the submit with
 * "stage X is not enabled for this instance".
 *
 * Resolution: pick the nearest ENABLED stage at or after the current one;
 * if nothing survives downstream, fall back to the nearest enabled stage
 * before it. `null` means no enabled stage can host the review.
 */

const ORDER: readonly AnnualReviewerRole[] = [
  'self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr', 'management',
] as const;

const STATUS_OF: Record<AnnualReviewerRole, AnnualReviewStatus> = {
  self: 'pending_self',
  manager: 'pending_manager',
  skip_manager: 'pending_skip',
  dept_head: 'pending_dept',
  bu_head: 'pending_bu',
  hr: 'pending_hr',
  management: 'pending_management',
};

const ROLE_OF: Partial<Record<AnnualReviewStatus, AnnualReviewerRole>> = {
  pending_self: 'self',
  pending_manager: 'manager',
  pending_skip: 'skip_manager',
  pending_dept: 'dept_head',
  pending_bu: 'bu_head',
  pending_hr: 'hr',
  pending_management: 'management',
};

/** Role a `pending_*` status belongs to, or `null` for terminal statuses. */
export function roleForStatus(status: AnnualReviewStatus): AnnualReviewerRole | null {
  return ROLE_OF[status] ?? null;
}

/** True when the status is a pending stage absent from `enabledStages`. */
export function isDeadEndStatus(
  status: AnnualReviewStatus,
  enabledStages: AnnualReviewerRole[] | null | undefined,
): boolean {
  const role = roleForStatus(status);
  if (!role) return false;
  return !(enabledStages ?? []).includes(role);
}

/**
 * Re-anchor a status onto an enabled stage. Non-pending statuses are returned
 * unchanged; `null` signals that no enabled stage exists at all.
 */
export function reanchorStatus(
  status: AnnualReviewStatus,
  enabledStages: AnnualReviewerRole[] | null | undefined,
): AnnualReviewStatus | null {
  const role = roleForStatus(status);
  if (!role) return status;

  const enabled = new Set(enabledStages ?? []);
  if (enabled.has(role)) return status;

  const idx = ORDER.indexOf(role);
  const forward = ORDER.slice(idx).find((s) => enabled.has(s));
  if (forward) return STATUS_OF[forward];

  const backward = [...ORDER.slice(0, idx)].reverse().find((s) => enabled.has(s));
  return backward ? STATUS_OF[backward] : null;
}
