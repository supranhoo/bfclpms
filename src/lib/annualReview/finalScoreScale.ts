/**
 * ADR-187 / POLICY §AR-FINAL-SCORE-SCALE-INVARIANT
 *
 * `annual_review_instances.total_score` is ALWAYS a normalised 0..100 value.
 * `criteria_weighted_score` is the raw Σ(weight × score) sum and may legitimately
 * exceed 100 — the two must never be conflated. A 24-Jul-2026 bulk repair wrote
 * the raw sum into `total_score` and blanked `final_rating` for 42 completed
 * instances; the DB trigger `trg_ar_total_score_scale` now rejects that class of
 * write. These pure helpers mirror the server rules for client-side display and
 * for the admin drift monitor.
 */

/** Default rating bands — mirrors `annual_review_resolve_final_rating`. */
export const DEFAULT_RATING_BANDS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 85, label: 'Outstanding' },
  { min: 70, label: 'Good' },
  { min: 55, label: 'Average' },
  { min: 0, label: 'Poor' },
];

/** True when `total_score` is a valid normalised appraisal score. */
export function isNormalisedTotalScore(total: number | null | undefined): boolean {
  if (total === null || total === undefined) return true; // in-flight reviews may be unscored
  return Number.isFinite(total) && total >= 0 && total <= 100;
}

/**
 * Normalise a raw weighted criteria total into 0..100 points.
 * `criteriaPoolMax` = 100 − Σ(system weights).
 */
export function normaliseCriteriaPoints(
  rawTotal: number,
  rawMax: number,
  criteriaPoolMax: number,
): number {
  if (!Number.isFinite(rawTotal) || !Number.isFinite(rawMax) || rawMax <= 0) return 0;
  const pool = Math.min(100, Math.max(0, criteriaPoolMax));
  return (rawTotal / rawMax) * pool;
}

/** Resolve the rating band for a normalised score. Returns null for a missing score. */
export function resolveFinalRating(
  total: number | null | undefined,
  bands: ReadonlyArray<{ min: number; label: string }> = DEFAULT_RATING_BANDS,
): string | null {
  if (total === null || total === undefined || !Number.isFinite(total)) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const b of sorted) if (total >= b.min) return b.label;
  return 'Poor';
}

export type FinalScoreIntegrityIssue = 'out_of_range' | 'missing_rating' | null;

/**
 * Classify a completed instance for the admin drift monitor.
 * `out_of_range` takes precedence — it is the more severe defect.
 */
export function classifyFinalScoreIntegrity(row: {
  overall_status: string;
  total_score: number | null | undefined;
  final_rating: string | null | undefined;
}): FinalScoreIntegrityIssue {
  if (!isNormalisedTotalScore(row.total_score)) return 'out_of_range';
  if (
    row.overall_status === 'completed'
    && row.total_score !== null && row.total_score !== undefined
    && (row.final_rating ?? '').trim() === ''
  ) return 'missing_rating';
  return null;
}

export const FINAL_SCORE_ISSUE_LABEL: Record<Exclude<FinalScoreIntegrityIssue, null>, string> = {
  out_of_range: 'Final score outside 0–100 (raw weighted sum stored)',
  missing_rating: 'Completed review has a score but no rating band',
};
