/**
 * ADR-290 / POLICY §CONSOLE-STAGE-SUPERSEDE — higher stage supersedes lower.
 *
 * The Performance Console worksheet uses the same semantics as the Bulk Review
 * dashboard: a reviewer standing at a later stage of the employee's resolved
 * workflow may sign off a row that is still waiting earlier in the chain. The
 * stages in between are closed out in the same audited batch, carrying the last
 * available score forward — they are never silently dropped.
 *
 * Pure by design: the server (`bu_console_kpi_advance`) is the SSOT and
 * re-checks everything; this module only makes the UI honest about what the
 * server will do.
 */
import { stageLabel } from '@/components/admin/bu-console/pipelineStages';

export interface SupersedePlan {
  /** Row can move to the target stage. */
  actionable: boolean;
  /** Stages closed out on the way (empty for a normal one-step move). */
  superseded: string[];
  /** Why the row cannot move — mirrors a server skip reason. */
  reason?: 'not_in_workflow' | 'status_unknown' | 'terminal_stage' | 'backwards';
}

/**
 * Resolve the stage path for one row against the employee's own workflow.
 * `stages` MUST come from the resolved workflow (POLICY §105) — never a
 * hardcoded ladder.
 */
export function planSupersede(
  stages: string[] | null | undefined,
  currentStatus: string | null | undefined,
  targetStage: string,
): SupersedePlan {
  const chain = stages ?? [];
  const tgt = chain.indexOf(targetStage);
  if (tgt === -1) return { actionable: false, superseded: [], reason: 'not_in_workflow' };

  const cur = currentStatus ? chain.indexOf(currentStatus) : -1;
  if (cur === -1) return { actionable: false, superseded: [], reason: 'status_unknown' };
  if (cur >= chain.length - 1) return { actionable: false, superseded: [], reason: 'terminal_stage' };
  if (tgt <= cur) return { actionable: false, superseded: [], reason: 'backwards' };

  return { actionable: true, superseded: chain.slice(cur + 1, tgt) };
}

/** Row caption for the worksheet — states plainly what the move will do. */
export function supersedeCaption(plan: SupersedePlan, targetStage: string): string {
  if (!plan.actionable) {
    switch (plan.reason) {
      case 'backwards': return `Already at or past ${stageLabel(targetStage)}`;
      case 'terminal_stage': return 'Already at the last stage of the workflow';
      case 'not_in_workflow': return `${stageLabel(targetStage)} is not part of this workflow`;
      default: return 'Not actionable at this stage';
    }
  }
  if (plan.superseded.length === 0) return `Moves to ${stageLabel(targetStage)}`;
  return `Signing at ${stageLabel(targetStage)} also closes ${plan.superseded.map(stageLabel).join(', ')}`;
}
