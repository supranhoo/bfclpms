/**
 * ADR-302 — Central KPI approval: pure model helpers.
 *
 * Mirrors the server contract shipped in ADR-301 (`org_kpi_submit_value`,
 * `org_kpi_decide`, `org_kpi_finalise`) so the Performance Console can show an
 * honest surface: only the actor whose step is current sees Approve / Send
 * back. The server stays the SSOT — these helpers never grant anything the
 * RPCs would refuse, they only avoid rendering buttons that would fail.
 *
 * No React, no I/O — unit tested in `centralApprovalModel.test.ts`.
 */

export type CentralWorkflowStage =
  | 'draft'
  | 'in_approval'
  | 'sent_back'
  | 'approved'
  | 'propagated';

export type CentralPropagationMode = 'central_fed' | 'central_approved';

export interface CentralChainStep {
  id: string;
  step_no: number;
  step_kind: 'provider' | 'approver';
  label: string;
  approver_id: string | null;
  approver_name: string | null;
  approver_role: string | null;
  effective_from: string;
}

export interface CentralDecision {
  id: string;
  step_no: number;
  step_label: string | null;
  decision: 'submitted' | 'approved' | 'sent_back' | 'finalised' | 'auto_closed';
  actor_id: string | null;
  comment: string | null;
  decided_at: string;
}

export interface CentralValueRow {
  id: string;
  achieved_value: number | null;
  target_value: number | null;
  remarks: string | null;
  is_na: boolean;
  workflow_stage: CentralWorkflowStage | null;
  current_step: number | null;
  submitted_at: string | null;
  propagation_mode: CentralPropagationMode | null;
  sent_back_reason: string | null;
  sent_back_at: string | null;
  updated_at: string | null;
}

export interface CentralActor {
  userId: string | null | undefined;
  roles: string[];
  isAdmin: boolean;
  /** True when the user owns this KPI's data feed (`org_kpi_data_owners`). */
  isDataOwner: boolean;
}

export type CentralStepStatus = 'done' | 'current' | 'sent_back' | 'pending';

export const CENTRAL_STAGE_LABELS: Record<CentralWorkflowStage, string> = {
  draft: 'Draft',
  in_approval: 'In approval',
  sent_back: 'Sent back',
  approved: 'Approved',
  propagated: 'Propagated',
};

export const CENTRAL_MODE_LABELS: Record<CentralPropagationMode, string> = {
  central_fed: 'Value only — employee review continues',
  central_approved: 'Value + close reviewer stages',
};

/** `workflow_stage` is nullable on legacy rows — NULL means draft. */
export function resolveStage(row: CentralValueRow | null | undefined): CentralWorkflowStage {
  return (row?.workflow_stage ?? 'draft') as CentralWorkflowStage;
}

/** The step the row currently sits on, or null when it is not in approval. */
export function currentStep(
  steps: CentralChainStep[],
  row: CentralValueRow | null | undefined,
): CentralChainStep | null {
  if (!row || resolveStage(row) !== 'in_approval' || row.current_step == null) return null;
  return steps.find(s => s.step_no === row.current_step) ?? null;
}

/** Mirrors `org_kpi_step_actor_matches`: named person OR role holder. */
export function actorMatchesStep(step: CentralChainStep | null, actor: CentralActor): boolean {
  if (!step || !actor.userId) return false;
  if (step.approver_id && step.approver_id === actor.userId) return true;
  if (step.approver_role && actor.roles.includes(step.approver_role)) return true;
  return false;
}

/** Approve / Send back visibility — current step actor, or admin override. */
export function canDecide(
  steps: CentralChainStep[],
  row: CentralValueRow | null | undefined,
  actor: CentralActor,
): boolean {
  const step = currentStep(steps, row);
  if (!step) return false;
  return actor.isAdmin || actorMatchesStep(step, actor);
}

/**
 * Enter value / Submit visibility. Mirrors `org_kpi_submit_value`: the data
 * owner (or an admin) may act while the row is draft or sent back; only an
 * admin may re-open a row that has already entered the ladder.
 */
export function canProvide(
  row: CentralValueRow | null | undefined,
  actor: CentralActor,
): boolean {
  if (!(actor.isAdmin || actor.isDataOwner)) return false;
  const stage = resolveStage(row);
  if (stage === 'draft' || stage === 'sent_back') return true;
  return actor.isAdmin;
}

/** Rail status per step, derived from the row plus the immutable trail. */
export function stepStatus(
  step: CentralChainStep,
  row: CentralValueRow | null | undefined,
  decisions: CentralDecision[],
): CentralStepStatus {
  const stage = resolveStage(row);
  const mine = decisions
    .filter(d => d.step_no === step.step_no)
    .slice()
    .sort((a, b) => a.decided_at.localeCompare(b.decided_at));
  const last = mine[mine.length - 1];

  if (step.step_kind === 'provider') {
    return stage === 'draft' || stage === 'sent_back' ? 'current' : 'done';
  }
  if (stage === 'sent_back' && last?.decision === 'sent_back') return 'sent_back';
  if (stage === 'in_approval' && row?.current_step === step.step_no) return 'current';
  if (last?.decision === 'approved') return 'done';
  if (stage === 'approved' || stage === 'propagated') return 'done';
  return 'pending';
}

/** Whole days a row has been waiting where it is. Never negative. */
export function ageingDays(
  since: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!since) return null;
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function formatAgeing(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function stepHolderLabel(step: CentralChainStep): string {
  if (step.approver_name) return step.approver_name;
  if (step.approver_role) return `Any ${step.approver_role.replace(/_/g, ' ')}`;
  return step.label;
}

/** Short, human line for the panel header. */
export function stageSummary(
  steps: CentralChainStep[],
  row: CentralValueRow | null | undefined,
): string {
  const stage = resolveStage(row);
  if (stage === 'in_approval') {
    const step = currentStep(steps, row);
    return step ? `With ${stepHolderLabel(step)}` : 'In approval';
  }
  if (stage === 'sent_back') return 'Sent back to the data provider';
  if (stage === 'approved') return 'Approved — ready to propagate';
  if (stage === 'propagated') return 'Propagated to mapped employees';
  return 'Not submitted yet';
}
