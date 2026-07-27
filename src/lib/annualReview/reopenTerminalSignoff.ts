import type { AnnualReviewerRole } from '@/types/annualReview';

/**
 * POLICY §AR-REOPEN-REQUIRES-TERMINAL-RESUBMIT (ADR-185)
 * ------------------------------------------------------------------
 * Re-opening a completed Annual Review (or sending it back upstream)
 * unlocks the terminal reviewer's response but PRESERVES the scores that
 * reviewer had already entered (send-back data preservation).
 *
 * Consequence: the grid/report keeps showing terminal stage scores while the
 * workflow is legitimately still pending, because the terminal reviewer never
 * re-submitted. That combination looks like a bug but is correct state.
 *
 * This helper is the SSOT for describing that state so UI surfaces can say
 * "draft, awaiting re-submit" instead of implying the stage is done.
 */

export interface StageResponseState {
  role: AnnualReviewerRole;
  isLocked: boolean;
  submittedAt: string | null;
  criteriaScores: Record<string, number | null | undefined> | null | undefined;
}

export type TerminalSignoffState =
  | 'completed'
  | 'awaiting_terminal_signoff'
  | 'awaiting_terminal_scores'
  | 'not_at_terminal_stage';

/** Number of criteria carrying a usable numeric score. */
export function scoredCriteriaCount(
  scores: Record<string, number | null | undefined> | null | undefined,
): number {
  if (!scores) return 0;
  return Object.values(scores).filter(
    (v) => v !== null && v !== undefined && !Number.isNaN(Number(v)),
  ).length;
}

/** The last enabled stage of a workflow, i.e. the terminal reviewer role. */
export function terminalStage(
  enabledStages: readonly AnnualReviewerRole[] | null | undefined,
): AnnualReviewerRole | null {
  if (!enabledStages || enabledStages.length === 0) return null;
  return enabledStages[enabledStages.length - 1];
}

/**
 * Classifies an instance whose workflow sits on the terminal stage.
 *
 * A preserved-but-unlocked terminal draft is `awaiting_terminal_signoff`:
 * scores exist, the review is NOT complete, and finalising it must derive the
 * aggregates from that preserved draft rather than zeroing them.
 */
export function resolveTerminalSignoffState(args: {
  overallStatus: string;
  enabledStages: readonly AnnualReviewerRole[] | null | undefined;
  responses: readonly StageResponseState[];
}): TerminalSignoffState {
  if (args.overallStatus === 'completed') return 'completed';

  const terminal = terminalStage(args.enabledStages);
  if (!terminal) return 'not_at_terminal_stage';

  const upstreamPending = (args.enabledStages ?? [])
    .filter((s) => s !== terminal)
    .some((s) => !args.responses.find((r) => r.role === s)?.isLocked);
  if (upstreamPending) return 'not_at_terminal_stage';

  const response = args.responses.find((r) => r.role === terminal);
  if (response?.isLocked) return 'completed';

  return scoredCriteriaCount(response?.criteriaScores) > 0
    ? 'awaiting_terminal_signoff'
    : 'awaiting_terminal_scores';
}

/** Short badge label for the grid / report. */
export function terminalSignoffLabel(state: TerminalSignoffState): string | null {
  switch (state) {
    case 'awaiting_terminal_signoff':
      return 'Scored draft — awaiting re-submit';
    case 'awaiting_terminal_scores':
      return 'Awaiting final reviewer';
    default:
      return null;
  }
}
