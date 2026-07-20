/**
 * Annual Review — Running Final Score projection.
 *
 * Projects the cycle-final score from the stages already **locked** (submitted)
 * on an instance using the SAME math the ADR-124 server-side finalizer applies
 * so late-chain reviewers see the number HR will persist.
 *
 * SSOT rules (POLICY §AR-RUNNING-FINAL-SCORE, §AR-WEIGHTED-SCORE-SCALE — ADR-126):
 *   - `annual_review_responses.weighted_score` and
 *     `annual_review_instances.criteria_weighted_score` are **raw weighted
 *      point sums** = Σ (criterion.weight × selected_score_0..5). They are NOT
 *      already on a 0..100 scale — the pre-ADR-126 projection treated them as
 *      /100 and produced values >100 (e.g. 269.6/100).
 *   - Overall projection mirrors `computeScoreComposition`:
 *         systemActual  = Σ resolvedSystemScores            (already /100 pts)
 *         criteriaPool  = 100 − Σ template.system_scores.weight
 *         criteriaPct   = raw_weighted / (Σ criterion.weight × 5)
 *         projected     = clamp(systemActual + criteriaPct × criteriaPool, 0, 100)
 *   - Terminal reviewer selection matches ADR-124 (HR → BU Head → Dept Head →
 *     Skip → Manager → Self). Only `is_locked === true` responses count.
 *   - Returns null score when there is no criteria max available or no locked
 *     reviewer; the UI card hides itself in that case.
 */

import type {
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewTemplate,
  AnnualReviewerRole,
} from '@/types/annualReview';
import type { StageWeightKey } from './finalScore';

/** ADR-124 terminal-picker order (highest priority first). */
const TERMINAL_ORDER: AnnualReviewerRole[] = [
  'hr', 'bu_head', 'dept_head', 'skip_manager', 'manager', 'self',
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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

function sumWeightMax(items: Array<{ weight?: number | null }> | undefined | null): number {
  if (!items) return 0;
  let t = 0;
  for (const it of items) {
    const w = Number(it?.weight);
    if (Number.isFinite(w) && w > 0) t += w;
  }
  return t;
}

export function computeRunningFinalScore(
  input: RunningFinalScoreInput,
): RunningFinalScoreOutput {
  const { instance, template, responses, resolvedSystemScores } = input;
  const sections = (template?.sections ?? {}) as {
    criteria?: Array<{ weight?: number | null }>;
    system_scores?: Array<{ weight?: number | null }>;
  };

  // Template maxima (SSOT: matches computeScoreComposition).
  const criteriaRawMax = sumWeightMax(sections.criteria) * 5;
  const systemMaxRaw = sumWeightMax(sections.system_scores);
  // The criteria pool occupies whatever is left of the /100 axis after the
  // system slot. Clamp defensively when a template mis-configures weights.
  const criteriaPoolMax = clamp(100 - systemMaxRaw, 0, 100);

  // System actual — values are persisted already in /100 percentage points.
  let systemActual = 0;
  let systemContributed = false;
  if (resolvedSystemScores) {
    for (const k of Object.keys(resolvedSystemScores)) {
      const v = resolvedSystemScores[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        systemActual += v;
        systemContributed = true;
      }
    }
  }

  // Terminal-locked reviewer picker (mirrors ADR-124 server RPC).
  const lockedRaw: Partial<Record<AnnualReviewerRole, number>> = {};
  for (const r of responses ?? []) {
    if (!r.is_locked) continue;
    if (typeof r.weighted_score === 'number' && Number.isFinite(r.weighted_score)) {
      lockedRaw[r.reviewer_role] = r.weighted_score;
    }
  }
  let terminalRole: AnnualReviewerRole | null = null;
  let terminalRaw: number | null = null;
  for (const role of TERMINAL_ORDER) {
    if (lockedRaw[role] != null) {
      terminalRole = role;
      terminalRaw = lockedRaw[role]!;
      break;
    }
  }

  const hasLockedStage = terminalRaw != null;

  // Compose contributing / pending buckets for the UI copy.
  const contributing: StageWeightKey[] = [];
  const pending: StageWeightKey[] = [];
  if (systemContributed) contributing.push('system');
  else if (systemMaxRaw > 0) pending.push('system');
  if (terminalRole) contributing.push(terminalRole as StageWeightKey);
  for (const role of TERMINAL_ORDER) {
    if (role === terminalRole) continue;
    if (lockedRaw[role] != null) continue; // earlier stage locked but not terminal → don't re-list
    pending.push(role as StageWeightKey);
  }

  if (!hasLockedStage && !systemContributed) {
    return { score_0_100: null, scaled_0_5: null, contributing, pending, hasLockedStage };
  }

  // Normalise the terminal reviewer's raw weighted score into the criteria pool.
  let criteriaContribution = 0;
  if (terminalRaw != null && criteriaRawMax > 0 && criteriaPoolMax > 0) {
    const pct = terminalRaw / criteriaRawMax; // 0..1 (may exceed 1 if data drift)
    criteriaContribution = pct * criteriaPoolMax;
  } else if (terminalRaw != null && criteriaRawMax === 0) {
    // Template has no criteria; treat raw as already-scaled 0..100 (legacy).
    criteriaContribution = terminalRaw;
  }

  const raw = systemActual + criteriaContribution;
  const clamped = clamp(raw, 0, 100);
  if (raw > 100.01 || raw < -0.01) {
    // Belt-and-braces guard: surfaces template mis-config in the console
    // without breaking the UI.
    // eslint-disable-next-line no-console
    console.warn('[runningFinalScore] pre-clamp overflow', {
      raw, systemActual, criteriaContribution, criteriaRawMax, criteriaPoolMax,
    });
  }

  return {
    score_0_100: Number(clamped.toFixed(4)),
    scaled_0_5: Number(((clamped / 100) * 5).toFixed(4)),
    contributing,
    pending,
    hasLockedStage,
  };
}