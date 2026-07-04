/**
 * Annual Review — Running Final Score projection.
 *
 * Thin wrapper around `computeFinalScore` that projects the cycle-final score
 * from the stages already **locked** (submitted) on an instance. Used by the
 * Dept Head / BU Head detail page so late-chain reviewers see the same number
 * HR will apply, re-normalised over the buckets still pending.
 *
 * SSOT rules (see POLICY §AR-RUNNING-FINAL-SCORE):
 *   - Only `is_locked === true` responses contribute; drafts must never leak.
 *   - Weight resolution reuses `resolveStageWeights` (override → template → legacy).
 *   - System-score contribution is the sum of the already-resolved system score
 *     values (already in /100 percentage points).
 *   - `criteria_weighted_score` is passed through so template-legacy configs
 *     (`{criteria:100}`) keep working.
 */

import type {
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewTemplate,
  AnnualReviewerRole,
} from '@/types/annualReview';
import {
  computeFinalScore,
  resolveStageWeights,
  STAGE_WEIGHT_KEYS,
  type StageWeightKey,
} from './finalScore';

export interface RunningFinalScoreInput {
  instance:
    | (Partial<AnnualReviewInstance> & {
        stage_weights_override?: Partial<Record<StageWeightKey, number>> | null;
        criteria_weighted_score?: number | null;
      })
    | null
    | undefined;
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined;
  responses: Pick<
    AnnualReviewResponse,
    'reviewer_role' | 'weighted_score' | 'is_locked'
  >[];
  resolvedSystemScores: Record<string, number> | null | undefined;
}

export interface RunningFinalScoreOutput {
  score_0_100: number | null;
  scaled_0_5: number | null;
  contributing: StageWeightKey[];
  /** Buckets configured with weight > 0 that had no input yet (pending stages). */
  pending: StageWeightKey[];
  /** True when at least one locked reviewer response fed the projection. */
  hasLockedStage: boolean;
}

export function computeRunningFinalScore(
  input: RunningFinalScoreInput,
): RunningFinalScoreOutput {
  const { instance, template, responses, resolvedSystemScores } = input;
  const stageWeights = resolveStageWeights(instance ?? null, template ?? null);

  const responsesByRole: Partial<Record<AnnualReviewerRole, number | null>> = {};
  let hasLockedStage = false;
  for (const r of responses ?? []) {
    if (!r.is_locked) continue;
    if (typeof r.weighted_score === 'number' && Number.isFinite(r.weighted_score)) {
      responsesByRole[r.reviewer_role] = r.weighted_score;
      hasLockedStage = true;
    }
  }

  const systemTotal = (() => {
    if (!resolvedSystemScores) return null;
    let t = 0;
    let any = false;
    for (const k of Object.keys(resolvedSystemScores)) {
      const v = resolvedSystemScores[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        t += v;
        any = true;
      }
    }
    return any ? t : null;
  })();

  const criteriaWeighted =
    typeof instance?.criteria_weighted_score === 'number'
      ? instance.criteria_weighted_score
      : null;

  const out = computeFinalScore({
    stageWeights,
    responsesByRole,
    systemScoreTotal: systemTotal,
    criteriaWeightedScore: criteriaWeighted,
  });

  // Compute pending: configured buckets (weight > 0) that did NOT contribute.
  const contributed = new Set<StageWeightKey>(out.contributing);
  const pending: StageWeightKey[] = [];
  for (const key of STAGE_WEIGHT_KEYS) {
    const w = stageWeights[key];
    if (w == null || w <= 0) continue;
    if (!contributed.has(key)) pending.push(key);
  }

  return {
    score_0_100: out.rawScore_0_100,
    scaled_0_5: out.scaled_0_5,
    contributing: out.contributing,
    pending,
    hasLockedStage,
  };
}