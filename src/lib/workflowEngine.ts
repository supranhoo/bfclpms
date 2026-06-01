/**
 * Workflow Engine - Pure utility functions for dynamic workflow resolution.
 * 
 * The workflow stages array from the database is the single source of truth.
 * Every component that transitions or displays statuses must use these functions
 * rather than relying on a hardcoded 6-stage pipeline.
 * 
 * Default full pipeline: ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
 * 8-stage pipeline: ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved']
 * 9-stage (with Functional Manager): adds 'functional_manager_check' after 'manager_check'.
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
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): Array<{ value: string; label: string }> {
  const allTargets: Record<string, Array<{ value: string; label: string; requiredStage?: string }>> = {
    manager: [
      { value: 'employee', label: 'Employee' },
    ],
    functional_manager: [
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
    skip_level: [
      { value: 'functional_manager', label: 'Functional Manager', requiredStage: 'functional_manager_check' },
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
    hr_pms: [
      { value: 'skip_level', label: 'Skip-Level Manager', requiredStage: 'skip_level_check' },
      { value: 'functional_manager', label: 'Functional Manager', requiredStage: 'functional_manager_check' },
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
    auditor: [
      { value: 'hr_pms', label: 'HR PMS Team', requiredStage: 'hr_pms_review' },
      { value: 'skip_level', label: 'Skip-Level Manager', requiredStage: 'skip_level_check' },
      { value: 'functional_manager', label: 'Functional Manager', requiredStage: 'functional_manager_check' },
      { value: 'manager', label: 'Manager', requiredStage: 'manager_check' },
      { value: 'employee', label: 'Employee' },
    ],
    management: [
      { value: 'auditor', label: 'Auditor', requiredStage: 'audit' },
      { value: 'hr_pms', label: 'HR PMS Team', requiredStage: 'hr_pms_review' },
      { value: 'skip_level', label: 'Skip-Level Manager', requiredStage: 'skip_level_check' },
      { value: 'functional_manager', label: 'Functional Manager', requiredStage: 'functional_manager_check' },
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
 */
export function resolveSendBackStatus(
  target: string,
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string {
  // Send back to employee always goes to kra_set
  if (target === 'employee') return 'kra_set';

  // Map each target to the workflow stage they OWN (their "completed" status)
  const targetStageMap: Record<string, string> = {
    manager: 'manager_check',
    functional_manager: 'functional_manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
  };

  const targetStage = targetStageMap[target];
  if (!targetStage) return 'kra_set';

  // Return the status BEFORE the target's stage so they see it as pending
  // e.g. manager reviews at 'self_review', skip_level reviews at 'manager_check'
  const previous = resolvePreviousStatus(targetStage, workflowStages);
  return previous || 'kra_set';
}

/**
 * Get the "pending" status for a view level — what status KPIs must be at
 * for this reviewer to see them as pending.
 */
export function resolvePendingStatuses(
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string[] {
  switch (viewLevel) {
    case 'manager':
      return ['self_review'];
    case 'functional_manager': {
      const idx = workflowStages.indexOf('functional_manager_check');
      if (idx === -1) return [];
      return [workflowStages[idx - 1]];
    }
    case 'skip_level': {
      const idx = workflowStages.indexOf('skip_level_check');
      if (idx === -1) return [];
      return [workflowStages[idx - 1]];
    }
    case 'hr_pms': {
      const idx = workflowStages.indexOf('hr_pms_review');
      if (idx === -1) return [];
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
      return [preceding, 'hr_pms_review'];
    }
    case 'auditor': {
      const idx = workflowStages.indexOf('audit');
      if (idx === -1) return [];
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
      return [preceding, 'audit'];
    }
    case 'management': {
      if (!workflowStages.includes('management_review')) return [];
      return ['management_review'];
    }
    default:
      return [];
  }
}

/**
 * Get the forward status for a view level — what status to set after approval.
 *
 * CONTRACT: Every role that is NOT the terminal reviewer MUST use
 * resolveNextStatus(ownStage, workflowStages) so the KPI advances past
 * the acting reviewer's own stage. Only `management` may hardcode 'approved'
 * since it is always the terminal stage.
 *
 * Convention used by manager / skip_level:
 *   Setting status to the role's OWN completed stage name signals "this
 *   reviewer is done" and the next reviewer's pending-status filter picks it up.
 *   e.g. manager sets 'manager_check' → auditor sees KPIs at 'manager_check'.
 *
 * For hr_pms and auditor the NEXT stage can vary by template (audit, approved,
 * management_review…) so resolveNextStatus is used to advance dynamically.
 */
export function resolveForwardStatus(
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string | null {
  // Map each role to the stage it owns in the workflow
  const roleStageMap: Record<string, string> = {
    manager: 'manager_check',
    functional_manager: 'functional_manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
    management: 'management_review',
  };

  const ownedStage = roleStageMap[viewLevel];

  // GUARD: If the role's stage does not exist in this workflow, return null.
  // Callers must handle null (e.g., skip status advancement).
  if (ownedStage && !workflowStages.includes(ownedStage)) {
    return null;
  }

  switch (viewLevel) {
    case 'manager': {
      const next = resolveNextStatus('manager_check', workflowStages);
      return next === 'approved' ? 'approved' : 'manager_check';
    }
    case 'functional_manager':
      return resolveNextStatus('functional_manager_check', workflowStages) || 'approved';
    case 'skip_level':
      return resolveNextStatus('skip_level_check', workflowStages) || 'approved';
    case 'hr_pms':
      return resolveNextStatus('hr_pms_review', workflowStages) || 'approved';
    case 'auditor':
      return resolveNextStatus('audit', workflowStages) || 'approved';
    case 'management':
      return 'approved';
    default:
      return null;
  }
}

/**
 * Get reviewable statuses — which KPI statuses this view level can act on.
 */
export function resolveReviewableStatuses(
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string[] {
  switch (viewLevel) {
    case 'manager':
      return ['self_review'];
    case 'functional_manager': {
      const idx = workflowStages.indexOf('functional_manager_check');
      if (idx === -1) return [];
      return [workflowStages[idx - 1]];
    }
    case 'skip_level': {
      const idx = workflowStages.indexOf('skip_level_check');
      if (idx === -1) return [];
      return [workflowStages[idx - 1]];
    }
    case 'hr_pms': {
      const idx = workflowStages.indexOf('hr_pms_review');
      if (idx === -1) return [];
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
      return [preceding, 'hr_pms_review'];
    }
    case 'auditor': {
      const idx = workflowStages.indexOf('audit');
      if (idx === -1) return [];
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
      return [preceding, 'audit'];
    }
    case 'management': {
      if (!workflowStages.includes('management_review')) return [];
      return ['management_review'];
    }
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
): ('self' | 'manager' | 'functional_manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management')[] {
  const stageMap: Record<string, 'self' | 'manager' | 'functional_manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management'> = {
    self_review: 'self',
    manager_check: 'manager',
    functional_manager_check: 'functional_manager',
    skip_level_check: 'skip_level',
    hr_pms_review: 'hr_pms',
    audit: 'auditor',
    management_review: 'management',
  };

  const visible: ('self' | 'manager' | 'functional_manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management')[] = [];
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
 * Resolve the "active review stage" — the stage a reviewer OWNS while working.
 * 
 * This is distinct from `resolvePendingStatuses` (queue-entry status).
 * When a reviewer saves without approving, the KPI should move to their
 * owned stage, not stay at the queue-entry status.
 * 
 * Example: auditor in [kra_set, self_review, audit, management_review, approved]
 *   - pendingStatus = 'self_review' (queue entry)
 *   - activeReviewStage = 'audit' (reviewer-owned stage)
 */
export function resolveActiveReviewStage(
  viewLevel: 'manager' | 'functional_manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): string {
  const stageMap: Record<string, string> = {
    manager: 'manager_check',
    functional_manager: 'functional_manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
    management: 'management_review',
  };
  const ownedStage = stageMap[viewLevel];
  // Only return the owned stage if it exists in the workflow
  if (ownedStage && workflowStages.includes(ownedStage)) {
    return ownedStage;
  }
  // Fallback to pendingStatus behavior
  return resolvePendingStatuses(viewLevel, workflowStages)[0] || 'self_review';
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
  viewType: 'my-kpis' | 'team-review' | 'functional-manager-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review',
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): boolean {
  switch (viewType) {
    case 'my-kpis':
      return kpiStatus === 'kra_set';
    case 'team-review':
      return kpiStatus === 'self_review';
    case 'functional-manager-review': {
      const idx = workflowStages.indexOf('functional_manager_check');
      if (idx === -1) return false;
      return kpiStatus === workflowStages[idx - 1];
    }
    case 'skip-level-review': {
      const idx = workflowStages.indexOf('skip_level_check');
      if (idx === -1) return false;
      return kpiStatus === workflowStages[idx - 1];
    }
    case 'hr-pms-review': {
      const idx = workflowStages.indexOf('hr_pms_review');
      if (idx === -1) return false;
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'skip_level_check';
      return kpiStatus === preceding || kpiStatus === 'hr_pms_review';
    }
    case 'audit': {
      const idx = workflowStages.indexOf('audit');
      if (idx === -1) return false;
      const preceding = idx > 0 ? workflowStages[idx - 1] : 'manager_check';
      return kpiStatus === preceding || kpiStatus === 'audit';
    }
    case 'management':
      return workflowStages.includes('management_review') && kpiStatus === 'management_review';
    default:
      return false;
  }
}
