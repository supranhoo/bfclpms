/**
 * ADR-257 / POLICY §KPI-ROLLBACK-FIRST-STAGE-GUARD
 *
 * A rollback request only makes sense from a stage that HAS a predecessor.
 * After an admin full reset (or a send-back) a KPI already sits at the first
 * workflow stage (`kra_set`), so there is nothing to roll back to — the
 * previous behaviour surfaced the internal error
 * "Cannot determine rollback target status" instead of saying so.
 *
 * Pure module — SSOT shared by the rollback hook, the dialog and every
 * "Request Rollback" entry point.
 */

/** Comprehensive ordered list of all possible workflow statuses. */
export const ALL_WORKFLOW_STATUSES = [
  'kra_set', 'self_review', 'manager_check', 'functional_manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review', 'approved',
] as const;

export const FIRST_STAGE_ROLLBACK_MESSAGE =
  'This KPI is already at the first stage (KRA Set). Edit and resubmit it instead of requesting a rollback.';

/**
 * True when `status` is the earliest stage of the resolved workflow (or of the
 * canonical list when the resolved stages do not contain it), i.e. no rollback
 * target can exist.
 */
export function isFirstWorkflowStage(
  status: string | null | undefined,
  workflowStages: readonly string[] | null | undefined,
): boolean {
  if (!status) return false;
  const stages = (workflowStages ?? []).filter(Boolean);
  const idx = stages.indexOf(status);
  if (idx >= 0) return idx === 0;
  const fallbackIdx = (ALL_WORKFLOW_STATUSES as readonly string[]).indexOf(status);
  return fallbackIdx === 0;
}

/** Rollback may be requested only from a non-first, non-approved stage. */
export function canRequestRollback(
  status: string | null | undefined,
  workflowStages: readonly string[] | null | undefined,
): boolean {
  if (!status || status === 'approved') return false;
  return !isFirstWorkflowStage(status, workflowStages);
}
