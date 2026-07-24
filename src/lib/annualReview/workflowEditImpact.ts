import type { AnnualReviewerRole } from '@/types/annualReview';

export type Mode = 'safe' | 'supersede';

export interface ReviewerChange {
  role: Exclude<AnnualReviewerRole, 'self'>;
  newReviewerId: string;
}

export interface LockedResp {
  role: string;
  reviewer_name: string | null;
  submitted_at: string | null;
}

export interface ImpactInput {
  currentStages: AnnualReviewerRole[];
  currentStatus: string;
  nextStages: AnnualReviewerRole[];
  reviewerChanges: ReviewerChange[];
  lockedResponses: LockedResp[];
}

export interface ImpactArchive {
  role: string;
  reviewer_name: string | null;
  submitted_at: string | null;
  cause: 'stage_removed' | 'reviewer_replaced';
}

export interface ImpactResult {
  archives: ImpactArchive[];
  addedStages: AnnualReviewerRole[];
  removedStages: AnnualReviewerRole[];
  rewindFrom: string | null;
  rewindTo: string | null;
  needsSupersede: boolean;
  notifications: { role: string; kind: 'new_reviewer' | 'removed_reviewer' | 'employee_workflow_changed' }[];
}

const POST_ACTION = new Set([
  'pending_manager','pending_skip','pending_dept','pending_bu','pending_hr','pending_management','completed',
]);

function firstPendingStatus(stages: AnnualReviewerRole[]): string {
  if (stages.length === 0) return 'not_started';
  const map: Record<AnnualReviewerRole, string> = {
    self: 'pending_self',
    manager: 'pending_manager',
    skip_manager: 'pending_skip',
    dept_head: 'pending_dept',
    bu_head: 'pending_bu',
    hr: 'pending_hr',
    management: 'pending_management',
  };
  return map[stages[0]];
}

/**
 * Pure calculator for the "Edit workflow & reviewers" impact preview.
 * Given the current + desired state, returns everything the dialog needs to
 * warn the admin: archives, rewind target, and outbound notifications.
 */
export function computeWorkflowEditImpact(input: ImpactInput): ImpactResult {
  const currSet = new Set(input.currentStages);
  const nextSet = new Set(input.nextStages);

  const removedStages = input.currentStages.filter((s) => !nextSet.has(s));
  const addedStages = input.nextStages.filter((s) => !currSet.has(s));

  const archives: ImpactArchive[] = [];
  for (const lr of input.lockedResponses) {
    if (removedStages.includes(lr.role as AnnualReviewerRole)) {
      archives.push({ ...lr, cause: 'stage_removed' });
    }
  }
  for (const rc of input.reviewerChanges) {
    const lr = input.lockedResponses.find((x) => x.role === rc.role);
    if (lr && !removedStages.includes(rc.role)) {
      archives.push({ ...lr, cause: 'reviewer_replaced' });
    }
  }

  const isPost = POST_ACTION.has(input.currentStatus);
  const stageDirty =
    input.currentStages.length !== input.nextStages.length ||
    input.currentStages.some((s, i) => s !== input.nextStages[i]);
  const needsSupersede = isPost && (stageDirty || archives.length > 0);

  let rewindTo: string | null = null;
  if (needsSupersede) {
    if (input.reviewerChanges.length > 0) {
      // rewind to the earliest changed stage in the new chain
      const idxs = input.reviewerChanges
        .map((rc) => input.nextStages.indexOf(rc.role))
        .filter((i) => i >= 0);
      if (idxs.length > 0) {
        const first = input.nextStages[Math.min(...idxs)];
        rewindTo = firstPendingStatus([first]);
      }
    }
    if (!rewindTo) rewindTo = firstPendingStatus(input.nextStages);
  }

  const notifications: ImpactResult['notifications'] = [];
  for (const rc of input.reviewerChanges) {
    notifications.push({ role: rc.role, kind: 'new_reviewer' });
  }
  for (const a of archives) {
    notifications.push({ role: a.role, kind: 'removed_reviewer' });
  }
  const prevTerminal = input.currentStages[input.currentStages.length - 1];
  const newTerminal = input.nextStages[input.nextStages.length - 1];
  if (
    removedStages.includes('self') ||
    addedStages.includes('self') ||
    prevTerminal !== newTerminal
  ) {
    notifications.push({ role: 'self', kind: 'employee_workflow_changed' });
  }

  return {
    archives,
    addedStages,
    removedStages,
    rewindFrom: needsSupersede ? input.currentStatus : null,
    rewindTo,
    needsSupersede,
    notifications,
  };
}