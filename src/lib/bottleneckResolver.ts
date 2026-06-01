/**
 * Workflow-aware bottleneck stage resolver.
 *
 * Given a KPI's current status and the employee's workflow pipeline,
 * determines WHO is actually responsible for acting next.
 *
 * Key insight: a KPI's `status` field represents the stage that has been
 * COMPLETED (or is currently active). The NEXT stage in the pipeline is
 * where the KPI is waiting — that tells us who needs to act.
 *
 * Exception: `kra_set` is the initial state — the employee hasn't done
 * anything yet, so THEY are responsible.
 */

export type ResolvedStageKey =
  | 'awaiting_self_review'
  | 'awaiting_manager'
  | 'awaiting_functional_manager'
  | 'awaiting_skip_level'
  | 'awaiting_hr_pms'
  | 'awaiting_audit'
  | 'awaiting_management';

export interface ResolvedBottleneckStage {
  stageKey: ResolvedStageKey;
  stageLabel: string;
  responsibleRole: string;
}

const DEFAULT_STAGES = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];

const NEXT_STAGE_MAP: Record<string, ResolvedBottleneckStage> = {
  self_review: {
    stageKey: 'awaiting_self_review',
    stageLabel: 'Awaiting Self Review',
    responsibleRole: 'Employee',
  },
  manager_check: {
    stageKey: 'awaiting_manager',
    stageLabel: 'Awaiting Manager Review',
    responsibleRole: 'Manager',
  },
  functional_manager_check: {
    stageKey: 'awaiting_functional_manager',
    stageLabel: 'Awaiting Functional Manager Review',
    responsibleRole: 'Functional Manager',
  },
  skip_level_check: {
    stageKey: 'awaiting_skip_level',
    stageLabel: 'Awaiting Skip-Level Review',
    responsibleRole: 'Skip-Level',
  },
  hr_pms_review: {
    stageKey: 'awaiting_hr_pms',
    stageLabel: 'Awaiting HR PMS Review',
    responsibleRole: 'HR PMS',
  },
  audit: {
    stageKey: 'awaiting_audit',
    stageLabel: 'Awaiting Audit',
    responsibleRole: 'Auditor',
  },
  management_review: {
    stageKey: 'awaiting_management',
    stageLabel: 'Awaiting Management Review',
    responsibleRole: 'Management',
  },
  approved: {
    // Edge case — shouldn't appear in bottleneck, but handle gracefully
    stageKey: 'awaiting_management',
    stageLabel: 'Approved',
    responsibleRole: '-',
  },
};

/**
 * Resolve the bottleneck stage for a KPI based on its status and
 * the employee's workflow pipeline.
 */
export function resolveBottleneckStage(
  kpiStatus: string,
  workflowStages?: string[],
): ResolvedBottleneckStage {
  const stages = workflowStages && workflowStages.length > 0 ? workflowStages : DEFAULT_STAGES;

  // Special case: kra_set always means "employee hasn't submitted yet"
  if (kpiStatus === 'kra_set') {
    return {
      stageKey: 'awaiting_self_review',
      stageLabel: 'Awaiting Self Review',
      responsibleRole: 'Employee',
    };
  }

  // Active-stage statuses: the KPI IS at this reviewer, not past them.
  // Aligned with workflowEngine's canReviewKpi & resolvePendingStatuses.
  if (kpiStatus === 'audit') return NEXT_STAGE_MAP['audit'];
  if (kpiStatus === 'management_review') return NEXT_STAGE_MAP['management_review'];
  if (kpiStatus === 'hr_pms_review') return NEXT_STAGE_MAP['hr_pms_review'];
  if (kpiStatus === 'skip_level_check') return NEXT_STAGE_MAP['skip_level_check'];
  if (kpiStatus === 'functional_manager_check') return NEXT_STAGE_MAP['functional_manager_check'];

  const currentIndex = stages.indexOf(kpiStatus);

  if (currentIndex === -1) {
    // Status not in pipeline — fall back to label based on status itself
    return NEXT_STAGE_MAP[kpiStatus] || {
      stageKey: 'awaiting_self_review',
      stageLabel: kpiStatus,
      responsibleRole: '-',
    };
  }

  const nextStage = currentIndex + 1 < stages.length ? stages[currentIndex + 1] : 'approved';

  // Safety net: if next stage is 'approved', the current reviewer is the terminal actor
  if (nextStage === 'approved') {
    return NEXT_STAGE_MAP[kpiStatus] || {
      stageKey: 'awaiting_management',
      stageLabel: kpiStatus,
      responsibleRole: '-',
    };
  }

  return NEXT_STAGE_MAP[nextStage] || {
    stageKey: 'awaiting_management',
    stageLabel: nextStage,
    responsibleRole: '-',
  };
}

/**
 * Resolve the responsible person's name based on the resolved stage.
 */
export function resolveResponsiblePerson(
  resolved: ResolvedBottleneckStage,
  employeeName: string,
  managerName: string | null,
): string {
  switch (resolved.stageKey) {
    case 'awaiting_self_review':
      return employeeName;
    case 'awaiting_manager':
      return managerName || 'Reporting Manager';
    case 'awaiting_functional_manager':
      return 'Functional Manager';
    case 'awaiting_skip_level':
      return 'Skip-Level Manager';
    case 'awaiting_hr_pms':
      return 'HR PMS';
    case 'awaiting_audit':
      return 'Auditor';
    case 'awaiting_management':
      return 'Management';
    default:
      return '-';
  }
}
