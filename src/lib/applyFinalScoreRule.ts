/**
 * applyFinalScoreRule — bridge between the SQL rule lookup
 * (`public.resolve_final_score_rule`) and the pure TS resolver
 * (`resolveFinalScore` in `finalScoreResolver.ts`).
 *
 * Used by every approval write path that stamps `review_submissions.final_score`
 * so the configured Final Score Rule (Workflow Config → Final Score Rules)
 * is honored. When no rule is configured the resolver returns `terminal_stage`
 * behavior which is byte-identical to the legacy COALESCE cascade.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  resolveFinalScore,
  extractStageScores,
  type WorkflowStageKey,
  type FinalScoreRule,
  type FinalScoreResolveResult,
} from '@/lib/finalScoreResolver';

// Map workflow_templates.stages codes → resolver stage keys.
const STAGE_CODE_TO_KEY: Record<string, WorkflowStageKey> = {
  self_review: 'self',
  manager_check: 'manager',
  functional_manager_check: 'functional_manager',
  skip_level_check: 'skip_level',
  hr_pms_review: 'hr_pms',
  audit: 'auditor',
  management_review: 'management',
  hr_calibration: 'hr_calibration',
  management_calibration: 'mgmt_calibration',
  mgmt_calibration: 'mgmt_calibration',
};

export interface SubmissionScoreRow {
  is_na?: boolean | null;
  self_score?: number | null;
  manager_score?: number | null;
  functional_manager_score?: number | null;
  skip_level_score?: number | null;
  hr_pms_score?: number | null;
  auditor_score?: number | null;
  management_score?: number | null;
  hr_calibration_score?: number | null;
  mgmt_calibration_score?: number | null;
}

export interface FinalScorePatch {
  final_score: number | null;
  final_rating: string | null;
  final_score_rule_type: string;
  final_score_rule_snapshot: Record<string, unknown> | null;
  final_score_explanation: string;
  final_score_calculated_at: string;
}

export interface ResolveAndPatchInput {
  employee_id: string;
  review_period: string;
  review_year: number;
  submission: SubmissionScoreRow;
}

export interface ResolveAndPatchOutput {
  patch: FinalScorePatch | null;
  result: FinalScoreResolveResult;
  blocked?: { reason: string };
}

/**
 * Resolve the effective final score for a submission using the configured rule.
 * Returns a `patch` ready to write to `review_submissions`, or null when blocked
 * (caller MUST surface the error and abort the approval).
 */
export async function resolveFinalScorePatch(
  input: ResolveAndPatchInput,
): Promise<ResolveAndPatchOutput> {
  const { employee_id, review_period, review_year, submission } = input;

  // 1. Resolve effective workflow template + stages for this employee/period.
  let workflowStages: WorkflowStageKey[] = [];
  let templateId: string | null = null;
  try {
    const { data: wfInfo } = await supabase.rpc('get_employee_workflow_info' as any, {
      employee_uuid: employee_id,
      p_review_period: review_period,
      p_review_year: review_year,
    });
    const row = Array.isArray(wfInfo) ? wfInfo[0] : wfInfo;
    if (row?.template_id) templateId = row.template_id as string;
    const stageCodes = Array.isArray(row?.stages) ? (row.stages as string[]) : [];
    workflowStages = stageCodes
      .map((s) => STAGE_CODE_TO_KEY[s])
      .filter(Boolean) as WorkflowStageKey[];
  } catch (err) {
    console.warn('[applyFinalScoreRule] workflow lookup failed — falling back to terminal_stage', err);
  }

  // 2. Fetch configured rule (may be null → legacy terminal_stage behavior).
  let rule: FinalScoreRule | null = null;
  if (templateId) {
    try {
      const { data: ruleRow } = await supabase.rpc('resolve_final_score_rule' as any, {
        p_employee_id: employee_id,
        p_template_id: templateId,
        p_review_period: review_period,
        p_review_year: review_year,
      });
      const r = Array.isArray(ruleRow) ? ruleRow[0] : ruleRow;
      if (r?.rule_type) {
        rule = {
          type: r.rule_type,
          stage_weights: r.stage_weights ?? undefined,
          missing_score_policy: r.missing_score_policy ?? 'block',
        };
      }
    } catch (err) {
      console.warn('[applyFinalScoreRule] rule lookup failed — falling back to terminal_stage', err);
    }
  }

  // 3. Compute via pure resolver.
  const result = resolveFinalScore({
    stageScores: extractStageScores(submission),
    workflowStages,
    rule,
    isNa: submission.is_na === true,
  });

  if (result.blocked) {
    return { patch: null, result, blocked: result.blocked };
  }

  const patch: FinalScorePatch = {
    final_score: result.final_score,
    final_rating: result.final_rating,
    final_score_rule_type: result.rule_type_used,
    final_score_rule_snapshot: rule
      ? { type: rule.type, stage_weights: rule.stage_weights ?? null, missing_score_policy: rule.missing_score_policy ?? 'block' }
      : null,
    final_score_explanation: result.explanation,
    final_score_calculated_at: new Date().toISOString(),
  };

  return { patch, result };
}