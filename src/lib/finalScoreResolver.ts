/**
 * Final Score Resolver — single source of truth (Phase 1 of POLICY §131)
 * ----------------------------------------------------------------------
 * Pure, no I/O. Mirror of public.fn_resolve_final_score (PL/pgSQL twin).
 *
 * Used by every approval / bulk / repair / reconciliation path that stamps
 * `review_submissions.final_score`. Reports MUST NOT call this — they read
 * the stored final_score.
 *
 * Backward compat: when `rule` is null, returns `terminal_stage` cascade
 * which is byte-identical to today's COALESCE(management, auditor, hr_pms,
 * skip_level, manager, self) behavior.
 */

export type WorkflowStageKey =
  | 'self'
  | 'manager'
  | 'functional_manager'
  | 'skip_level'
  | 'hr_pms'
  | 'auditor'
  | 'management'
  | 'hr_calibration'
  | 'mgmt_calibration';

export type FinalScoreRuleType =
  | 'terminal_stage'
  | 'self_final'
  | 'manager_final'
  | 'functional_manager_final'
  | 'skip_level_final'
  | 'hr_pms_final'
  | 'auditor_final'
  | 'management_final'
  | 'hr_calibration_final'
  | 'mgmt_calibration_final'
  | 'avg_manager_skip'
  | 'avg_self_manager_skip'
  | 'avg_all_completed'
  | 'weighted_custom';

export type MissingScorePolicy = 'block' | 'ignore' | 'zero';

export type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

export interface FinalScoreRule {
  type: FinalScoreRuleType;
  stage_weights?: Partial<Record<WorkflowStageKey, number>>;
  missing_score_policy?: MissingScorePolicy;
}

export interface FinalScoreResolveInput {
  /** Reviewer-stage scores. Missing keys ⇒ stage not scored. */
  stageScores: Partial<Record<WorkflowStageKey, number | null>>;
  /** Stages actually configured in the effective workflow template. */
  workflowStages: WorkflowStageKey[];
  /** Effective rule, or null ⇒ legacy terminal_stage behavior. */
  rule: FinalScoreRule | null;
  /** When true, KPI is N/A — final_score stays null. */
  isNa?: boolean;
}

export interface FinalScoreResolveResult {
  final_score: number | null;
  final_rating: RatingLevel | null;
  rule_type_used: FinalScoreRuleType | 'na';
  stage_weights_used?: Record<string, unknown>;
  explanation: string;
  missing_warnings: Array<{ stage: WorkflowStageKey; reason: 'missing' | 'not_in_workflow' }>;
  /** Present when missing_score_policy='block' fired. Approval MUST be halted. */
  blocked?: { reason: string };
}

const TERMINAL_CASCADE: WorkflowStageKey[] = [
  'management',
  'mgmt_calibration',
  'auditor',
  'hr_calibration',
  'hr_pms',
  'skip_level',
  'functional_manager',
  'manager',
  'self',
];

const SINGLE_STAGE_RULE_MAP: Record<string, WorkflowStageKey> = {
  self_final: 'self',
  manager_final: 'manager',
  functional_manager_final: 'functional_manager',
  skip_level_final: 'skip_level',
  hr_pms_final: 'hr_pms',
  auditor_final: 'auditor',
  management_final: 'management',
  hr_calibration_final: 'hr_calibration',
  mgmt_calibration_final: 'mgmt_calibration',
};

function getScore(
  scores: Partial<Record<WorkflowStageKey, number | null>>,
  stage: WorkflowStageKey,
): number | null {
  const v = scores[stage];
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bandRating(score: number): RatingLevel {
  const r = Math.round(score);
  if (r >= 5) return 'blue';
  if (r >= 4) return 'green';
  if (r >= 3) return 'yellow';
  return 'red';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(5, n));
}

/**
 * Resolve the final score for one KPI submission.
 * Pure function — never reads from network or DB.
 */
export function resolveFinalScore(input: FinalScoreResolveInput): FinalScoreResolveResult {
  const { stageScores, workflowStages, rule, isNa } = input;

  if (isNa) {
    return {
      final_score: null,
      final_rating: null,
      rule_type_used: 'na',
      explanation: 'KPI marked N/A — no final score',
      missing_warnings: [],
    };
  }

  const ruleType: FinalScoreRuleType = rule?.type ?? 'terminal_stage';
  const policy: MissingScorePolicy = rule?.missing_score_policy ?? 'block';
  const warnings: FinalScoreResolveResult['missing_warnings'] = [];

  // 1. terminal_stage — legacy COALESCE cascade
  if (ruleType === 'terminal_stage') {
    for (const stage of TERMINAL_CASCADE) {
      const s = getScore(stageScores, stage);
      if (s !== null) {
        const score = clamp(s);
        return {
          final_score: round2(score),
          final_rating: bandRating(score),
          rule_type_used: ruleType,
          explanation: `Last completed stage: ${stage} = ${round2(score)}`,
          missing_warnings: warnings,
        };
      }
    }
    return {
      final_score: null,
      final_rating: null,
      rule_type_used: ruleType,
      explanation: 'No reviewer stage has a score',
      missing_warnings: warnings,
    };
  }

  // 2. single-stage rules
  if (ruleType in SINGLE_STAGE_RULE_MAP) {
    const stage = SINGLE_STAGE_RULE_MAP[ruleType];
    let s = getScore(stageScores, stage);
    if (s === null) {
      warnings.push({ stage, reason: 'missing' });
      if (policy === 'block') {
        return {
          final_score: null,
          final_rating: null,
          rule_type_used: ruleType,
          explanation: `${stage} score required by rule`,
          missing_warnings: warnings,
          blocked: { reason: `Required stage ${stage} has no score` },
        };
      }
      if (policy === 'zero') s = 0;
      else {
        return {
          final_score: null,
          final_rating: null,
          rule_type_used: ruleType,
          explanation: `${stage} missing, ignored`,
          missing_warnings: warnings,
        };
      }
    }
    const score = clamp(s as number);
    return {
      final_score: round2(score),
      final_rating: bandRating(score),
      rule_type_used: ruleType,
      explanation: `${stage} score = ${round2(score)}`,
      missing_warnings: warnings,
    };
  }

  // 3. averages
  if (
    ruleType === 'avg_manager_skip' ||
    ruleType === 'avg_self_manager_skip' ||
    ruleType === 'avg_all_completed'
  ) {
    const required: WorkflowStageKey[] =
      ruleType === 'avg_manager_skip'
        ? ['manager', 'skip_level']
        : ruleType === 'avg_self_manager_skip'
          ? ['self', 'manager', 'skip_level']
          : (['self', 'manager', 'functional_manager', 'skip_level', 'hr_pms', 'auditor', 'management', 'hr_calibration', 'mgmt_calibration'] as WorkflowStageKey[]);

    let sum = 0;
    let count = 0;
    const used: Record<string, number> = {};

    for (const stage of required) {
      // For named averages, every required stage must be in workflow
      if (ruleType !== 'avg_all_completed' && !workflowStages.includes(stage)) {
        warnings.push({ stage, reason: 'not_in_workflow' });
        continue;
      }
      let s = getScore(stageScores, stage);
      if (s === null) {
        // avg_all_completed silently skips missing/incomplete stages
        if (ruleType === 'avg_all_completed') continue;
        warnings.push({ stage, reason: 'missing' });
        if (policy === 'block') {
          return {
            final_score: null,
            final_rating: null,
            rule_type_used: ruleType,
            explanation: 'Required stage missing',
            missing_warnings: warnings,
            blocked: { reason: `Stage ${stage} has no score` },
          };
        }
        if (policy === 'zero') s = 0;
        else continue;
      }
      sum += s as number;
      count += 1;
      used[stage] = s as number;
    }

    if (count === 0) {
      return {
        final_score: null,
        final_rating: null,
        rule_type_used: ruleType,
        explanation: 'No stage scores available to average',
        missing_warnings: warnings,
      };
    }
    const avg = clamp(sum / count);
    return {
      final_score: round2(avg),
      final_rating: bandRating(avg),
      rule_type_used: ruleType,
      stage_weights_used: used,
      explanation: `Average of ${count} stage(s) = ${round2(avg)}`,
      missing_warnings: warnings,
    };
  }

  // 4. weighted_custom
  if (ruleType === 'weighted_custom') {
    const weights = rule?.stage_weights ?? {};
    let sumW = 0;
    let sumSW = 0;
    const used: Record<string, { score: number; weight: number }> = {};
    for (const [stageKey, w] of Object.entries(weights) as [WorkflowStageKey, number][]) {
      if (!w || w <= 0) continue;
      if (!workflowStages.includes(stageKey)) {
        warnings.push({ stage: stageKey, reason: 'not_in_workflow' });
        continue;
      }
      let s = getScore(stageScores, stageKey);
      if (s === null) {
        warnings.push({ stage: stageKey, reason: 'missing' });
        if (policy === 'block') {
          return {
            final_score: null,
            final_rating: null,
            rule_type_used: ruleType,
            stage_weights_used: weights as Record<string, unknown>,
            explanation: 'Weighted stage missing required score',
            missing_warnings: warnings,
            blocked: { reason: `Stage ${stageKey} has weight ${w}% but no score` },
          };
        }
        if (policy === 'zero') s = 0;
        else continue;
      }
      sumW += w;
      sumSW += (s as number) * w;
      used[stageKey] = { score: s as number, weight: w };
    }
    if (sumW <= 0) {
      return {
        final_score: null,
        final_rating: null,
        rule_type_used: ruleType,
        explanation: 'No valid weighted stages contributed',
        missing_warnings: warnings,
      };
    }
    const wAvg = clamp(sumSW / sumW);
    const parts = Object.entries(used)
      .map(([k, v]) => `${v.weight}% ${k} (${v.score})`)
      .join(' + ');
    return {
      final_score: round2(wAvg),
      final_rating: bandRating(wAvg),
      rule_type_used: ruleType,
      stage_weights_used: used,
      explanation: `${parts} = ${round2(wAvg)}`,
      missing_warnings: warnings,
    };
  }

  // Unknown rule type — fall back to terminal_stage rather than crash.
  return resolveFinalScore({ ...input, rule: { type: 'terminal_stage' } });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convenience: pull stage scores from a review_submissions-shaped row. */
export function extractStageScores(sub: {
  self_score?: number | null;
  manager_score?: number | null;
  functional_manager_score?: number | null;
  skip_level_score?: number | null;
  hr_pms_score?: number | null;
  auditor_score?: number | null;
  management_score?: number | null;
  hr_calibration_score?: number | null;
  mgmt_calibration_score?: number | null;
}): Partial<Record<WorkflowStageKey, number | null>> {
  return {
    self: sub.self_score ?? null,
    manager: sub.manager_score ?? null,
    functional_manager: sub.functional_manager_score ?? null,
    skip_level: sub.skip_level_score ?? null,
    hr_pms: sub.hr_pms_score ?? null,
    auditor: sub.auditor_score ?? null,
    management: sub.management_score ?? null,
    hr_calibration: sub.hr_calibration_score ?? null,
    mgmt_calibration: sub.mgmt_calibration_score ?? null,
  };
}