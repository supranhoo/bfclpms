/**
 * POLICY §54 v5 — Multi-month cycle service layer.
 *
 * Single source of truth for resolving the EFFECTIVE workflow chain to render
 * on a sibling row of a multi-month KPI cycle. The cycle's effective workflow
 * is the TERMINAL month's workflow at the time of approval. Sibling per-period
 * `workflow_config` overrides are intentionally ignored when the sibling row
 * was percolated, because rendering them produces empty / mismatched stage
 * cards (e.g. an "HR PMS — N/A" card on a sibling whose terminal was approved
 * via Audit).
 *
 * The percolation triggers stamp `kpi_audit_logs.metadata.terminal_workflow_template_id`
 * on every `SCORE_PERCOLATED` / `SCORE_REPERCOLATED` / `WORKFLOW_CONFIG_REPERCOLATE`
 * audit row. We read that stamp to find the chain.
 *
 * Pure helpers — no React, no Supabase coupling beyond a typed accessor.
 * Consumers: `KpiJourneySection.tsx`, `KpiHistoryCard.tsx`, reports.
 */

import { DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

const STAGE_TO_SCORE_FIELD: Record<string, string> = {
  self_review: 'self_score',
  manager_check: 'manager_score',
  skip_level_check: 'skip_level_score',
  hr_pms_review: 'hr_pms_score',
  audit: 'auditor_score',
  management_review: 'management_score',
};

/**
 * True when a submission row was created by the percolation triggers
 * (POLICY §54 v3+). Detected via the `auto_advance_reason` text written by
 * `percolate_multimonth_score` and `repercolate_on_submission_update`.
 */
export function isPercolatedSiblingSubmission(submission: { auto_advance_reason?: string | null } | null | undefined): boolean {
  const reason = submission?.auto_advance_reason ?? '';
  return /^Multi-month sibling — (auto-populated|re-percolated) from terminal month/i.test(reason);
}

/**
 * Infer the EFFECTIVE chain for a percolated sibling from the actual
 * scored stages of the percolated submission. This is a defense-in-depth
 * fallback when the audit-log stamp is unavailable (older percolations
 * pre-v5). It guarantees we never render stage cards for chains the
 * terminal didn't execute.
 *
 * Returns the canonical workflow stages (kra_set + scored stages + approved).
 */
export function inferChainFromSubmission(
  submission: Record<string, unknown> | null | undefined,
  fallbackStages: string[] = DEFAULT_WORKFLOW_STAGES,
): string[] {
  if (!submission) return fallbackStages;

  const scored: string[] = [];
  for (const [stage, field] of Object.entries(STAGE_TO_SCORE_FIELD)) {
    const val = submission[field];
    if (val !== null && val !== undefined) {
      scored.push(stage);
    }
  }

  if (scored.length === 0) return fallbackStages;

  // Order stages by the canonical ordering in fallbackStages so we keep the
  // visual progression consistent across all rendered chains.
  const canonical = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];
  const set = new Set<string>(['kra_set', ...scored, 'approved']);
  return canonical.filter(s => set.has(s));
}

/**
 * Resolve the effective chain to render for a given sibling row.
 *
 * @param siblingSubmission   The percolated review_submissions row (or null).
 * @param localStages         The sibling's own workflow_config-resolved stages (legacy behavior).
 * @param terminalStages      The terminal month's stages, when known (preferred).
 * @returns The stages to render for the sibling card.
 */
export function resolveEffectiveChain(
  siblingSubmission: Record<string, unknown> | null | undefined,
  localStages: string[] | undefined,
  terminalStages?: string[] | null,
): string[] {
  if (!isPercolatedSiblingSubmission(siblingSubmission as { auto_advance_reason?: string | null } | null | undefined)) {
    return localStages ?? DEFAULT_WORKFLOW_STAGES;
  }
  if (terminalStages && terminalStages.length > 0) return terminalStages;
  return inferChainFromSubmission(siblingSubmission, localStages);
}
