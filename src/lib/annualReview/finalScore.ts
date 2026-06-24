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

/** Roles eligible to receive a slice of the Criteria pool in v2 config. */
export type CriteriaMixRole = Exclude<StageWeightKey, 'system' | 'criteria'>;

export const CRITERIA_MIX_ROLES: CriteriaMixRole[] = [
  'self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr',
];

/**
 * Two-tier weight config (Phase 3).
 * `pools` splits the final score between the System Score and the Criteria
 * (reviewer) pool. `criteria_mix` splits the criteria pool across reviewer
 * roles. Both groups must independently sum to 100.
 */
export interface StageWeightsV2 {
  pools: { system?: number; criteria?: number };
  criteria_mix: Partial<Record<CriteriaMixRole, number>>;
}

function sumValues(map: Record<string, number | undefined> | undefined): number {
  if (!map) return 0;
  let t = 0;
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) return Number.NaN;
    t += v;
  }
  return t;
}

/** True when v2 pools sum to 100 and criteria_mix sums to 100 (±0.01). */
export function isValidStageWeightsV2(v: StageWeightsV2 | null | undefined): boolean {
  if (!v || !v.pools || !v.criteria_mix) return false;
  const poolTotal = sumValues(v.pools as Record<string, number | undefined>);
  const mixTotal = sumValues(v.criteria_mix as Record<string, number | undefined>);
  if (!Number.isFinite(poolTotal) || !Number.isFinite(mixTotal)) return false;
  return Math.abs(poolTotal - 100) < 0.01 && Math.abs(mixTotal - 100) < 0.01;
}

/**
 * Derive the flat StageWeights snapshot from a valid v2 config.
 * Result always sums to 100 (within rounding).
 */
export function flattenStageWeightsV2(v: StageWeightsV2): StageWeights {
  const out: StageWeights = {};
  const system = Number(v.pools?.system) || 0;
  const criteria = Number(v.pools?.criteria) || 0;
  if (system > 0) out.system = Number(system.toFixed(4));
  for (const role of CRITERIA_MIX_ROLES) {
    const pct = Number(v.criteria_mix?.[role]) || 0;
    if (pct <= 0 || criteria <= 0) continue;
    out[role] = Number(((criteria * pct) / 100).toFixed(4));
  }
  return out;
}

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
  const sections = template?.sections as
    | { stage_weights?: StageWeights; stage_weights_v2?: StageWeightsV2 }
    | undefined;
  const v2 = sections?.stage_weights_v2 ?? null;
  if (isValidStageWeightsV2(v2)) return flattenStageWeightsV2(v2!);
  const tpl = sections?.stage_weights ?? null;
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