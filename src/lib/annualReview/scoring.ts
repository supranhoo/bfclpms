import type {
  AnnualReviewResponse,
  AnnualReviewerRole,
  TemplateCriterion,
  TemplateSystemScore,
} from '@/types/annualReview';

export interface CriteriaScoreSummary {
  /** Σ (weight * selected_score) — actual weighted criteria score (out of `maxCriteriaScore`). */
  totalCriteriaScore: number;
  /** Σ (weight * 5) — maximum possible criteria score. */
  maxCriteriaScore: number;
}

/**
 * Weighted criteria score.
 *   total = Σ (weight_i * score_i)
 *   max   = Σ (weight_i * 5)
 * Criteria with no selected score (undefined) are excluded from `total` but still
 * count toward `max` so partial submissions don't over-inflate ratios.
 */
export function computeCriteriaScore(
  criteria: TemplateCriterion[],
  criteriaScores: Record<string, number | undefined>,
): CriteriaScoreSummary {
  let total = 0;
  let max = 0;
  for (const c of criteria) {
    const w = Number(c.weight) || 0;
    max += w * 5;
    const raw = criteriaScores[c.id];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      total += w * raw;
    }
  }
  return { totalCriteriaScore: total, maxCriteriaScore: max };
}

/**
 * Overall appraisal score = Σ system_scores + criteria_total, capped at 100.
 * System scores are stored already-weighted (i.e. already in percentage points).
 */
export function computeOverallScore(
  systemScoresConfig: TemplateSystemScore[],
  systemScoresValues: Record<string, number>,
  criteriaSummary: CriteriaScoreSummary,
): number {
  let systemTotal = 0;
  for (const s of systemScoresConfig) {
    const v = systemScoresValues[s.id];
    if (typeof v === 'number' && Number.isFinite(v)) systemTotal += v;
  }
  return Math.min(100, systemTotal + criteriaSummary.totalCriteriaScore);
}

/** Convenience: compute the weighted score for a single response object. */
export function computeResponseWeightedScore(
  criteria: TemplateCriterion[],
  response: Pick<AnnualReviewResponse, 'criteria_scores'>,
): number {
  return computeCriteriaScore(criteria, response.criteria_scores ?? {}).totalCriteriaScore;
}

/**
 * Normalise a stored `weighted_score` (Σ weight × selected_score) into a
 * template-independent 0–5 rating for display.
 *
 *   max     = Σ (weight_i × 5)   for criteria that include `reviewerRole`
 *             in their `reviewer_stages`.
 *   rating  = weighted_score / max × 5
 *           = weighted_score / Σ weight_i   (algebraic simplification)
 *
 * The `reviewer_stages` filter mirrors the PL/pgSQL SSOT
 * `public.compute_annual_review_weighted_score(instance_id, reviewer_role)`
 * so client and server denominators cannot drift.
 *
 * Returns `null` when the score is missing, non-finite, or the applicable
 * weight sum is 0 (nothing to normalise against).
 *
 * See POLICY §AR-STAGE-RATING-DISPLAY.
 */
export function computeCriteriaRatingOutOf5(
  criteria: TemplateCriterion[] | null | undefined,
  weightedScore: number | null | undefined,
  reviewerRole: AnnualReviewerRole,
): number | null {
  if (typeof weightedScore !== 'number' || !Number.isFinite(weightedScore)) return null;
  if (!criteria || criteria.length === 0) return null;
  let weightSum = 0;
  for (const c of criteria) {
    const stages = c.reviewer_stages ?? [];
    if (!stages.includes(reviewerRole)) continue;
    const w = Number(c.weight) || 0;
    if (w > 0) weightSum += w;
  }
  if (weightSum <= 0) return null;
  // weighted_score / (weightSum * 5) * 5  ==  weighted_score / weightSum
  return weightedScore / weightSum;
}