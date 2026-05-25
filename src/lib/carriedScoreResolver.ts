/**
 * Carried-Score Resolver — bulk sign-off preview (POLICY §111.7.a, v2.66.13.9)
 * --------------------------------------------------------------------------
 * Mirrors `public.bulk_write_stage_scores` cascade for ONE cell, plus a
 * 5th rung: when no prior stage scored, derive a rating from the row's own
 * `kpis` thresholds and `review_submissions.achieved_value`.
 *
 * Per-employee correctness — every cell uses its OWN kpis row (Wt%, formula,
 * R0-R5). No shared/global rule.
 *
 * Pure. No I/O. Mirror of the SQL helper `fn_compute_rating_from_achievement`.
 */

import { calculateRating } from '@/lib/ratingCalculation';
import type { QualitativeOption } from '@/lib/qualitativeUom';

export type SignoffStage = 'manager' | 'skip_level' | 'hr_pms' | 'auditor';

export type CarriedSource =
  | 'self'
  | 'manager'
  | 'skip_level'
  | 'hr_pms'
  | 'computed'
  | 'none';

export interface KpiRule {
  /** Per-employee KPI row id (kpis.id). */
  id: string;
  weightage: number | null;
  criteria: string | null;
  uom: string | null;
  uom_type: string | null;
  target_value: number | null;
  threshold_mode: string | null; // 'absolute' | 'ratio'
  r0: string | number | null;
  r1: string | number | null;
  r2: string | number | null;
  r3: string | number | null;
  r4: string | number | null;
  r5: string | number | null;
  qualitative_options?: unknown;
}

export interface SubmissionScores {
  self_score: number | null;
  manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
  achieved_value: number | string | null;
  is_na: boolean | null;
}

export interface ResolveInput {
  stage: SignoffStage;
  submission: SubmissionScores;
  kpi: KpiRule;
}

export interface ResolveResult {
  score: number | null;
  source: CarriedSource;
}

/**
 * Cascade self → manager → skip → hr_pms (matches stage), then computed.
 * Returns { score: null, source: 'none' } only when achievement is also missing.
 */
export function resolveCarriedScore({ stage, submission, kpi }: ResolveInput): ResolveResult {
  // N/A cells must not be advanced — preview surfaces them as 'none'.
  if (submission.is_na === true) return { score: null, source: 'none' };

  // Stage cascade (mirrors DB exactly, see bulk_write_stage_scores lines 89-114).
  if (stage === 'manager') {
    if (submission.self_score != null) return { score: submission.self_score, source: 'self' };
  } else if (stage === 'skip_level') {
    if (submission.manager_score != null) return { score: submission.manager_score, source: 'manager' };
    if (submission.self_score != null) return { score: submission.self_score, source: 'self' };
  } else if (stage === 'hr_pms') {
    if (submission.skip_level_score != null) return { score: submission.skip_level_score, source: 'skip_level' };
    if (submission.manager_score != null) return { score: submission.manager_score, source: 'manager' };
    if (submission.self_score != null) return { score: submission.self_score, source: 'self' };
  } else if (stage === 'auditor') {
    if (submission.hr_pms_score != null) return { score: submission.hr_pms_score, source: 'hr_pms' };
    if (submission.skip_level_score != null) return { score: submission.skip_level_score, source: 'skip_level' };
    if (submission.manager_score != null) return { score: submission.manager_score, source: 'manager' };
    if (submission.self_score != null) return { score: submission.self_score, source: 'self' };
  }

  // 5th rung — compute from achievement using THIS row's KPI rule.
  return computeFromAchievement(submission.achieved_value, kpi);
}

function computeFromAchievement(
  achieved: number | string | null,
  kpi: KpiRule,
): ResolveResult {
  if (achieved === null || achieved === undefined || achieved === '') {
    return { score: null, source: 'none' };
  }
  // Require at least one threshold to compute a rating.
  const hasThresholds = [kpi.r5, kpi.r4, kpi.r3, kpi.r2, kpi.r1]
    .some(v => v !== null && v !== undefined && v !== '');
  if (!hasThresholds && kpi.uom_type !== 'binary' && kpi.uom_type !== 'tiered') {
    return { score: null, source: 'none' };
  }

  const result = calculateRating(
    achieved,
    kpi.target_value,
    {
      r5: kpi.r5, r4: kpi.r4, r3: kpi.r3,
      r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 ?? null,
    },
    kpi.criteria ?? 'Higher is Better',
    0, // weightage not needed for rating, applied in impact step
    (kpi.uom_type as 'numeric' | 'binary' | 'tiered') || 'numeric',
    Array.isArray(kpi.qualitative_options)
      ? (kpi.qualitative_options as QualitativeOption[])
      : null,
    kpi.uom,
    (kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute',
  );

  // calculateRating returns rating 0 in many "no data" paths — distinguish
  // a genuine computed-0 (R0 cap hit) from "couldn't compute". We treat any
  // rating result as 'computed' since we already validated achieved + thresholds.
  return { score: result.rating, source: 'computed' };
}
