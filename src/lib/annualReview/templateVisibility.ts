import type { AnnualReviewTemplate, TemplateCriterion, AnnualReviewerRole } from '@/types/annualReview';

/**
 * SSOT for "should we render the criteria card on this stage?"
 *
 * Two independent hide triggers (OR):
 *   1. No criteria are mapped to the given stage (`reviewer_stages` filter
 *      yields an empty list — criteria with no `reviewer_stages` are treated
 *      as visible to every stage, matching the existing inline filter).
 *   2. The template's `system_scores` weights already sum to 100, leaving
 *      criteria with no mathematical contribution to the final score.
 */

export function criteriaForStage(
  template: AnnualReviewTemplate | null | undefined,
  stage: AnnualReviewerRole,
): TemplateCriterion[] {
  const all = template?.sections.criteria ?? [];
  return all.filter((c) => !c.reviewer_stages?.length || c.reviewer_stages.includes(stage));
}

export function systemScoresFullyAllocated(
  template: AnnualReviewTemplate | null | undefined,
): boolean {
  const items = template?.sections.system_scores ?? [];
  const sum = items.reduce((acc, s) => acc + (Number.isFinite(s.weight) ? Number(s.weight) : 0), 0);
  return sum >= 100;
}

export function shouldHideCriteriaCard(
  template: AnnualReviewTemplate | null | undefined,
  stage: AnnualReviewerRole,
): boolean {
  if (!template) return false;
  if (systemScoresFullyAllocated(template)) return true;
  return criteriaForStage(template, stage).length === 0;
}