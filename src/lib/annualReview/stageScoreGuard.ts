import type { AnnualReviewTemplate, TemplateCriterion, AnnualReviewerRole } from '@/types/annualReview';
import { criteriaForStage, shouldHideCriteriaCard } from './templateVisibility';

/**
 * POLICY §AR-STAGE-SCORE-REQUIRED (ADR-172)
 * ------------------------------------------------------------------
 * A reviewer stage may only advance once every criterion visible to that
 * stage carries a numeric score.
 *
 * Before ADR-172 this guard existed inline in `TeamReviewDetailContent`
 * but was gated on `role === 'self'`, so Dept Head / BU Head / Manager
 * stages could submit with `criteria_scores = {}`. The empty response was
 * then locked with `weighted_score = 0.00`, which the admin Progress grid
 * renders as a legitimate `0.0` rating.
 *
 * Narrative-only stages (no criteria mapped to the stage, or system scores
 * already fully allocated — see `shouldHideCriteriaCard`) are exempt: they
 * legitimately have nothing to score. This mirrors ADR-170.
 *
 * The same invariant is enforced server-side inside
 * `advance_annual_review_status`; this helper is the client-side mirror so
 * reviewers get a precise, actionable message instead of a raw SQL error.
 */

export type CriteriaScoreMap = Record<string, number | null | undefined>;

/** True when the stage renders no scoreable criteria at all. */
export function isNarrativeOnlyStage(
  template: AnnualReviewTemplate | null | undefined,
  stage: AnnualReviewerRole,
): boolean {
  return shouldHideCriteriaCard(template, stage);
}

/**
 * Returns the criteria this stage still has to score. Empty array = safe to
 * submit. Narrative-only stages always return an empty array.
 */
export function missingStageCriteria(
  template: AnnualReviewTemplate | null | undefined,
  stage: AnnualReviewerRole,
  scores: CriteriaScoreMap | null | undefined,
): TemplateCriterion[] {
  if (isNarrativeOnlyStage(template, stage)) return [];
  const map = scores ?? {};
  return criteriaForStage(template, stage).filter((c) => {
    const v = map[c.id];
    return v === undefined || v === null || Number.isNaN(Number(v));
  });
}

/**
 * User-facing validation message, or `null` when the stage may advance.
 */
export function stageScoreGuardMessage(
  template: AnnualReviewTemplate | null | undefined,
  stage: AnnualReviewerRole,
  scores: CriteriaScoreMap | null | undefined,
): string | null {
  const missing = missingStageCriteria(template, stage, scores);
  if (missing.length === 0) return null;
  return `Please score all criteria before submitting. Missing: ${missing
    .map((c) => c.name ?? c.id)
    .join(', ')}`;
}

/**
 * Display-side counterpart used by admin grids and reports: a locked stage
 * response with zero scored criteria on a scoreable template is a data gap,
 * NOT a genuine zero rating. Such cells must render as "—" with a warning
 * rather than `0.0`.
 */
export function isUnscoredStageResponse(args: {
  isLocked: boolean;
  criteriaScoreCount: number;
  templateHasScoreableCriteria: boolean;
}): boolean {
  return args.isLocked && args.templateHasScoreableCriteria && args.criteriaScoreCount === 0;
}
