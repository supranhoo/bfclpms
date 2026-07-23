import type { AnnualReviewerRole } from '@/types/annualReview';

/**
 * ADR-136 (amends ADR-129) / POLICY §AR-ROLLBACK-TERMINAL-STAGE.
 * Mirror of the server resolver used by `rollback_annual_review_completed`.
 *
 * Evidence-based: the effective terminal stage is the highest-seniority
 * reviewer role that is present in BOTH `enabled_stages` AND the set of
 * `submittedReviewerRoles` (i.e. roles that actually have a response row on
 * the instance). When the caller can't supply the submitted set, we fall
 * back to enabled-only for a graceful label.
 *
 * Returns `null` when nothing upstream of `self` is available to unlock.
 */
const SENIORITY: Exclude<AnnualReviewerRole, 'self'>[] = [
  'management', 'hr', 'bu_head', 'dept_head', 'skip_manager', 'manager',
];

const LABELS: Record<Exclude<AnnualReviewerRole, 'self'>, string> = {
  management: 'pending Management',
  hr: 'pending HR',
  bu_head: 'pending BU Head',
  dept_head: 'pending Department Head',
  skip_manager: 'pending Skip Manager',
  manager: 'pending Manager',
};

export function resolveRollbackTerminalStage(
  enabledStages: readonly AnnualReviewerRole[] | null | undefined,
  submittedReviewerRoles?: readonly AnnualReviewerRole[] | null,
): Exclude<AnnualReviewerRole, 'self'> | null {
  if (!enabledStages || enabledStages.length === 0) return null;
  const enabled = new Set(enabledStages);
  const submitted = submittedReviewerRoles && submittedReviewerRoles.length > 0
    ? new Set(submittedReviewerRoles)
    : null;
  for (const s of SENIORITY) {
    if (!enabled.has(s)) continue;
    if (submitted && !submitted.has(s)) continue;
    return s;
  }
  return null;
}

export function rollbackTerminalLabel(
  enabledStages: readonly AnnualReviewerRole[] | null | undefined,
  submittedReviewerRoles?: readonly AnnualReviewerRole[] | null,
): string {
  const s = resolveRollbackTerminalStage(enabledStages, submittedReviewerRoles);
  return s ? LABELS[s] : 'the previous reviewer stage';
}