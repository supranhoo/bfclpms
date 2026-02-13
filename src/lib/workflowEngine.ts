/**
 * Workflow Engine - Pure utility functions for dynamic workflow resolution.
 * 
 * The workflow stages array from the database is the single source of truth.
 * Every component that transitions or displays statuses must use these functions
 * rather than relying on a hardcoded 6-stage pipeline.
 * 
 * Default full pipeline: ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
 * Example skip_manager: ['kra_set', 'self_review', 'audit', 'management_review', 'approved']
 */

export const DEFAULT_WORKFLOW_STAGES = [
  'kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'
];

/**
 * Resolve the next status in the workflow for a given current status.
 * Returns null if at the end or status not found.
 */
export function resolveNextStatus(
  currentStatus: string,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string | null {
  const idx = workflowStages.indexOf(currentStatus);
  if (idx === -1 || idx >= workflowStages.length - 1) return null;
  return workflowStages[idx + 1];
}

/**
 * Resolve the previous status in the workflow (for send-back).
 * Returns null if at the beginning or status not found.
 */
export function resolvePreviousStatus(
  currentStatus: string,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string | null {
  const idx = workflowStages.indexOf(currentStatus);
  if (idx <= 0) return null;
  return workflowStages[idx - 1];
}

/**
 * Get valid send-back targets for a given view level and workflow stages.
 * Only returns targets for stages that exist in the workflow.
 */
export function resolveSendBackTargets(
  viewLevel: 'manager' | 'auditor' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): Array<{ value: string; label: string }> {
  const allTargets: Record<string, Array<{ value: string; label: string; requiredStage?: string }>> = {
    manager: [
      { value: 'employee', label: 'Employee' },
    ],
    auditor: [
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
    management: [
      { value: 'auditor', label: 'Auditor', requiredStage: 'audit' },
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
  };

  return (allTargets[viewLevel] || []).filter(target => {
    if (!target.requiredStage) return true;
    return workflowStages.includes(target.requiredStage);
  });
}

/**
 * Resolve the send-back status for a given target and workflow.
 * When sending back to 'manager' but manager_check doesn't exist, falls back to self_review.
 */
export function resolveSendBackStatus(
  target: string,
  viewLevel: 'manager' | 'auditor' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string {
  const statusMap: Record<string, string> = {
    employee: 'kra_set',
    manager: workflowStages.includes('manager_check') ? 'self_review' : 'self_review',
    auditor: 'audit',
  };

  // For auditor sending back to manager: if manager_check doesn't exist, send to self_review
  if (target === 'manager' && viewLevel === 'auditor') {
    return workflowStages.includes('manager_check') ? 'self_review' : 'self_review';
  }

  // For management sending back to manager
  if (target === 'manager' && viewLevel === 'management') {
    return workflowStages.includes('manager_check') ? 'manager_check' : 'self_review';
  }

  return statusMap[target] || 'kra_set';
}

/**
 * Get the "pending" status for a view level — what status KPIs must be at
 * for this reviewer to see them as pending.
 */
export function resolvePendingStatuses(
  viewLevel: 'manager' | 'auditor' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string[] {
  switch (viewLevel) {
    case 'manager':
      return ['self_review'];
    case 'auditor':
      // If manager_check is skipped, auditor picks up from self_review
      if (!workflowStages.includes('manager_check')) {
        return ['self_review', 'audit'];
      }
      return ['manager_check', 'audit'];
    case 'management':
      return ['management_review'];
    default:
      return [];
  }
}

/**
 * Get the forward status for a view level — what status to set after approval.
 */
export function resolveForwardStatus(
  viewLevel: 'manager' | 'auditor' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string {
  switch (viewLevel) {
    case 'manager':
      // After manager approves, advance to next stage in workflow after manager_check
      // If manager_check exists, set to manager_check. If not, this shouldn't be called.
      return 'manager_check';
    case 'auditor':
      return resolveNextStatus('audit', workflowStages) || 'management_review';
    case 'management':
      return 'approved';
    default:
      return 'approved';
  }
}

/**
 * Get reviewable statuses — which KPI statuses this view level can act on.
 */
export function resolveReviewableStatuses(
  viewLevel: 'manager' | 'auditor' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string[] {
  switch (viewLevel) {
    case 'manager':
      return ['self_review'];
    case 'auditor':
      if (!workflowStages.includes('manager_check')) {
        return ['self_review', 'audit'];
      }
      return ['manager_check', 'audit'];
    case 'management':
      return ['management_review'];
    default:
      return [];
  }
}

/**
 * Get visible journey stages for the KpiJourneySection.
 * Maps workflow statuses to journey stage keys.
 */
export function getVisibleJourneyStages(
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): ('self' | 'manager' | 'auditor' | 'management')[] {
  const stageMap: Record<string, 'self' | 'manager' | 'auditor' | 'management'> = {
    self_review: 'self',
    manager_check: 'manager',
    audit: 'auditor',
    management_review: 'management',
  };

  const visible: ('self' | 'manager' | 'auditor' | 'management')[] = [];
  for (const status of workflowStages) {
    const journeyStage = stageMap[status];
    if (journeyStage && !visible.includes(journeyStage)) {
      visible.push(journeyStage);
    }
  }
  return visible;
}

/**
 * Get visible tracker stages for the WorkflowProgressTracker.
 * Returns only the stage config keys that exist in the employee's workflow.
 */
export function getVisibleTrackerStages(
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string[] {
  return workflowStages;
}

/**
 * Check if a stage exists in the workflow.
 */
export function hasStage(
  stage: string,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): boolean {
  return workflowStages.includes(stage);
}

/**
 * Determine if a KPI is reviewable by a given view type, taking workflow into account.
 */
export function canReviewKpi(
  kpiStatus: string,
  viewType: 'my-kpis' | 'team-review' | 'audit' | 'management',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): boolean {
  switch (viewType) {
    case 'my-kpis':
      return kpiStatus === 'kra_set';
    case 'team-review':
      return kpiStatus === 'self_review';
    case 'audit':
      if (!workflowStages.includes('manager_check')) {
        return kpiStatus === 'self_review' || kpiStatus === 'audit';
      }
      return kpiStatus === 'manager_check' || kpiStatus === 'audit';
    case 'management':
      return kpiStatus === 'management_review';
    default:
      return false;
  }
}
