/**
 * ADR-205 — PIP candidate rule (extracted SSOT).
 *
 * Previously duplicated between `MonthlyTrendView.tsx` and its unit test.
 * An employee is a PIP candidate when EVERY month in the selected range has a
 * score (via the standard 8-stage fallback cascade) AND every one of those
 * scores is strictly below the configured threshold. A missing month
 * disqualifies the row — an incomplete picture is never treated as failure.
 */

export interface PipCandidateInput {
  monthlyScores: Record<string, number | null | undefined>;
}

export function isPipCandidate(
  employee: PipCandidateInput,
  monthKeys: string[],
  threshold: number | null | undefined,
): boolean {
  if (threshold == null || !Number.isFinite(threshold)) return false;
  if (!monthKeys || monthKeys.length === 0) return false;
  for (const key of monthKeys) {
    const v = employee.monthlyScores[key];
    if (v == null || !Number.isFinite(v)) return false;
    if (v >= threshold) return false;
  }
  return true;
}
