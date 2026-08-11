/**
 * ADR-205 / ADR-252 — PIP candidate rule (SSOT).
 *
 * An employee is a PIP candidate when EVERY *scored* month in the selected
 * range is AT OR BELOW the configured threshold (`<=`), and at least
 * `minScoredMonths` months of the range are actually scored.
 *
 * ADR-252 changes two things versus ADR-205:
 *  1. `<` became `<=` (a score exactly on the threshold qualifies).
 *  2. Unscored months (joiner/leaver, pending review) are skipped instead of
 *     disqualifying the row; the minimum scored-month count guards against
 *     acting on a single data point.
 *
 * Implementation delegates to the shared continuity evaluator so TNI and PIP
 * always apply identical semantics.
 */
import { evaluateContinuity } from '@/lib/continuity/allMonthsAtOrBelow';

export interface PipCandidateInput {
  monthlyScores: Record<string, number | null | undefined>;
}

export function isPipCandidate(
  employee: PipCandidateInput,
  monthKeys: string[],
  threshold: number | null | undefined,
  minScoredMonths = 1,
): boolean {
  return evaluateContinuity(employee?.monthlyScores, monthKeys, threshold, { minScoredMonths })
    .qualifies;
}
