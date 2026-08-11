/**
 * ADR-252 / POLICY §PMS-CONTINUITY-AT-OR-BELOW
 *
 * Shared continuity evaluator for TNI (KPI-level) and PIP (overall-level)
 * detection. One rule, one implementation, so the two modules cannot drift.
 *
 * Rule:
 *  - Every **scored** month in the selected range must be AT OR BELOW the
 *    configured threshold (`<=`, not `<`).
 *  - Months without a score (joiner/leaver, review pending, N/A) are SKIPPED,
 *    never treated as a failure and never treated as a pass.
 *  - At least `minScoredMonths` months must actually be scored, otherwise the
 *    picture is too thin to act on and the row does not qualify.
 */

/** Float-comparison tolerance so 3.00 stored as 2.9999999 still qualifies. */
const EPSILON = 1e-9;

export interface ContinuityMonth {
  key: string;
  score: number | null;
}

export interface ContinuityResult {
  qualifies: boolean;
  /** Per-month evidence in range order (null when the month has no score). */
  months: ContinuityMonth[];
  /** Count of months that carry a usable score. */
  scoredMonths: number;
  /** Count of months in the range with no score (skipped). */
  skippedMonths: number;
  worstScore: number | null;
  latestScore: number | null;
  /** True when fewer months were scored than `minScoredMonths`. */
  shortWindow: boolean;
}

export interface ContinuityOptions {
  /** Minimum number of scored months required to qualify. Default 1. */
  minScoredMonths?: number;
}

function toScore(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export function evaluateContinuity(
  scores: Record<string, number | null | undefined> | undefined | null,
  monthKeys: string[] | undefined | null,
  threshold: number | null | undefined,
  options?: ContinuityOptions,
): ContinuityResult {
  const keys = monthKeys ?? [];
  const months: ContinuityMonth[] = keys.map(key => ({ key, score: toScore(scores?.[key]) }));
  const scored = months.filter(m => m.score != null);
  const minScored = Math.max(1, Math.round(options?.minScoredMonths ?? 1));
  const shortWindow = scored.length < minScored;

  const thresholdOk = threshold != null && Number.isFinite(threshold);
  const allAtOrBelow = scored.length > 0
    && thresholdOk
    && scored.every(m => (m.score as number) <= (threshold as number) + EPSILON);

  return {
    qualifies: !!(thresholdOk && !shortWindow && allAtOrBelow),
    months,
    scoredMonths: scored.length,
    skippedMonths: months.length - scored.length,
    worstScore: scored.length ? Math.min(...scored.map(m => m.score as number)) : null,
    latestScore: scored.length ? (scored[scored.length - 1].score as number) : null,
    shortWindow,
  };
}

/** Convenience boolean form. */
export function allMonthsAtOrBelow(
  scores: Record<string, number | null | undefined> | undefined | null,
  monthKeys: string[] | undefined | null,
  threshold: number | null | undefined,
  options?: ContinuityOptions,
): boolean {
  return evaluateContinuity(scores, monthKeys, threshold, options).qualifies;
}