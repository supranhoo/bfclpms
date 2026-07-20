import type { AnnualReviewerRole } from '@/types/annualReview';

/**
 * ADR-129 / POLICY §AR-ROLLBACK-TERMINAL-STAGE.
 * Mirror of the server resolver used by `rollback_annual_review_completed`.
 * Picks the highest-seniority reviewer stage present in `enabled_stages`.
 * Returns `null` when only `self` is enabled (nothing upstream to unlock).
 */
const SENIORITY: Exclude<AnnualReviewerRole, 'self'>[] = [
  'hr', 'bu_head', 'dept_head', 'skip_manager', 'manager',
];

const LABELS: Record<Exclude<AnnualReviewerRole, 'self'>, string> = {
  hr: 'pending HR',
  bu_head: 'pending BU Head',
  dept_head: 'pending Department Head',
  skip_manager: 'pending Skip Manager',
  manager: 'pending Manager',
};

export function resolveRollbackTerminalStage(
  enabledStages: readonly AnnualReviewerRole[] | null | undefined,
): Exclude<AnnualReviewerRole, 'self'> | null {
  if (!enabledStages || enabledStages.length === 0) return null;
  const set = new Set(enabledStages);
  for (const s of SENIORITY) if (set.has(s)) return s;
  return null;
}

export function rollbackTerminalLabel(
  enabledStages: readonly AnnualReviewerRole[] | null | undefined,
): string {
  const s = resolveRollbackTerminalStage(enabledStages);
  return s ? LABELS[s] : 'the previous reviewer stage';
}