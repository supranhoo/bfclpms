import type {
  AnnualReviewResponse,
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