/**
 * Annual Review — Final Score SSOT.
 *
 * Computes the cycle-final score from a configurable blend of:
 *   - per-stage reviewer weighted scores (self / manager / skip_manager / bu_head / hr)
 *   - aggregated system-score contribution
 *   - the legacy criteria_weighted_score (kept as a first-class bucket so
 *     templates without explicit stage_weights keep current behavior)
 *
 * Resolution order for the weight map (highest precedence first):
 *   1. instance.stage_weights_override (per-employee override)
 *   2. template.sections.stage_weights (template-level config)
 *   3. legacy default — { criteria: 100 } (matches behavior before this feature)
 *
 * All math is pure and unit-tested. The same algorithm is mirrored server-side
 * in PL/pgSQL (`public.annual_review_compute_final_score`) so triggers and the
 * finalization RPC produce identical numbers.
 */

import type {
  AnnualReviewerRole,
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewTemplate,
} from '@/types/annualReview';

export type StageWeightKey =
  | 'self'
  | 'manager'
  | 'skip_manager'
  | 'dept_head'
  | 'bu_head'
  | 'hr'
  | 'system'
  | 'criteria';

export type StageWeights = Partial<Record<StageWeightKey, number>>;

export const STAGE_WEIGHT_KEYS: StageWeightKey[] = [
  'self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr', 'system', 'criteria',
];

export const LEGACY_STAGE_WEIGHTS: StageWeights = { criteria: 100 };

/** True when every weight is a finite, non-negative number and they sum to 100 (±0.01). */
export function isValidStageWeights(w: StageWeights | null | undefined): boolean {
  if (!w) return false;
  let total = 0;
  for (const key of STAGE_WEIGHT_KEYS) {
    const v = w[key];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) return false;
    total += v;
  }
  return Math.abs(total - 100) < 0.01;
}

/**
 * Resolve the effective weight map for an instance.
 * Override beats template; invalid maps fall through to the next layer.
 * Returns a shallow copy — callers may mutate freely.
 */
export function resolveStageWeights(
  instance: (Partial<AnnualReviewInstance> & { stage_weights_override?: StageWeights | null }) | null | undefined,
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
): StageWeights {
  const override = (instance?.stage_weights_override ?? null) as StageWeights | null;
  if (isValidStageWeights(override)) return { ...override! };
  const tpl = (template?.sections as { stage_weights?: StageWeights } | undefined)?.stage_weights ?? null;
  if (isValidStageWeights(tpl)) return { ...tpl! };
  return { ...LEGACY_STAGE_WEIGHTS };
}

/** Map reviewer_role → stage weight key. */
export function roleToWeightKey(role: AnnualReviewerRole): StageWeightKey | null {
  switch (role) {
    case 'self': return 'self';
    case 'manager': return 'manager';
    case 'skip_manager': return 'skip_manager';
    case 'dept_head': return 'dept_head';
    case 'bu_head': return 'bu_head';
    case 'hr': return 'hr';
    default: return null;
  }
}

export interface ComputeFinalScoreInput {
  stageWeights: StageWeights;
  /**
   * Map of reviewer_role → weighted_score on the same 0..100 scale as
   * criteria_weighted_score. Missing/null entries are renormalised out
   * (their weight is redistributed proportionally across present buckets).
   */
  responsesByRole: Partial<Record<AnnualReviewerRole, number | null>>;
  /** Sum of resolved system-score contributions, 0..100 scale, or null when not computed. */
  systemScoreTotal: number | null;
  /** Legacy criteria_weighted_score on the instance, 0..100 scale, or null. */
  criteriaWeightedScore: number | null;
}

export interface ComputeFinalScoreOutput {
  /** Blended score on the 0..100 scale. Null when no buckets contributed. */
  rawScore_0_100: number | null;
  /** Same score scaled to the 0..5 rating axis. Null when no buckets contributed. */
  scaled_0_5: number | null;
  /** Buckets that actually contributed (after dropping null inputs). */
  contributing: StageWeightKey[];
  /** True when one or more configured buckets were dropped (no input available). */
  renormalised: boolean;
}

/**
 * Pure final-score blend. Drops buckets with null inputs, renormalises the
 * remaining weights to sum to 100, and returns a weighted average.
 * Returns `null` scores when no bucket contributed.
 */
export function computeFinalScore(input: ComputeFinalScoreInput): ComputeFinalScoreOutput {
  const { stageWeights, responsesByRole, systemScoreTotal, criteriaWeightedScore } = input;

  const sources: Array<{ key: StageWeightKey; weight: number; value: number }> = [];
  let dropped = false;

  for (const key of STAGE_WEIGHT_KEYS) {
    const weight = stageWeights[key];
    if (weight == null || weight <= 0) continue;

    let value: number | null = null;
    if (key === 'system') value = systemScoreTotal;
    else if (key === 'criteria') value = criteriaWeightedScore;
    else value = responsesByRole[key as AnnualReviewerRole] ?? null;

    if (value == null || !Number.isFinite(value)) {
      dropped = true;
      continue;
    }
    sources.push({ key, weight, value });
  }

  if (sources.length === 0) {
    return { rawScore_0_100: null, scaled_0_5: null, contributing: [], renormalised: dropped };
  }

  const totalWeight = sources.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight <= 0) {
    return { rawScore_0_100: null, scaled_0_5: null, contributing: [], renormalised: dropped };
  }

  const raw = sources.reduce((acc, s) => acc + (s.value * s.weight) / totalWeight, 0);
  return {
    rawScore_0_100: Number(raw.toFixed(4)),
    scaled_0_5: Number(((raw / 100) * 5).toFixed(4)),
    contributing: sources.map((s) => s.key),
    renormalised: dropped,
  };
}

/**
 * Convenience: build the `responsesByRole` map from an array of responses.
 * Uses `weighted_score` (already 0..100 scale).
 */
export function responsesToRoleMap(
  responses: Pick<AnnualReviewResponse, 'reviewer_role' | 'weighted_score' | 'submitted_at'>[],
): Partial<Record<AnnualReviewerRole, number | null>> {
  const out: Partial<Record<AnnualReviewerRole, number | null>> = {};
  for (const r of responses) {
    if (!r.submitted_at) continue;
    out[r.reviewer_role] = r.weighted_score ?? null;
  }
  return out;
}