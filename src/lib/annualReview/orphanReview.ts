import type { AnnualReviewerRole, AnnualReviewStatus } from '@/types/annualReview';

/**
 * ADR-173 / POLICY §AR-ORPHAN-REVIEWER-SUCCESSION.
 *
 * TypeScript mirror of `public.get_orphaned_annual_reviews`. An annual review
 * stage is "orphaned" when the stage is enabled on a non-terminal instance but
 * its mapped reviewer is missing or deactivated. Keep this in sync with the SQL
 * function — the console renders from the RPC, this helper exists so UI/report
 * code can classify rows locally without a round-trip.
 */

export type OrphanReason = 'no_reviewer_mapped' | 'inactive_reviewer';

export const ORPHAN_REASON_LABEL: Record<OrphanReason, string> = {
  no_reviewer_mapped: 'No reviewer mapped',
  inactive_reviewer: 'Reviewer deactivated',
};

export const ORPHAN_STAGE_LABEL: Record<Exclude<AnnualReviewerRole, 'self'>, string> = {
  manager: 'Manager',
  skip_manager: 'Skip Manager',
  dept_head: 'Dept Head',
  bu_head: 'BU Head',
  hr: 'HR',
  management: 'Management',
};

/** Statuses that can never be orphaned — the workflow is finished or the row is out of scope. */
const TERMINAL_STATUSES: AnnualReviewStatus[] = ['completed', 'excluded'];

const STAGE_STATUS: Record<Exclude<AnnualReviewerRole, 'self'>, AnnualReviewStatus> = {
  manager: 'pending_manager',
  skip_manager: 'pending_skip',
  dept_head: 'pending_dept',
  bu_head: 'pending_bu',
  hr: 'pending_hr',
  management: 'pending_management',
};

export interface OrphanCandidateInstance {
  id: string;
  employee_id: string;
  overall_status: AnnualReviewStatus;
  enabled_stages: AnnualReviewerRole[];
  manager_id: string | null;
  skip_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  management_id?: string | null;
}

export interface OrphanFinding {
  instanceId: string;
  employeeId: string;
  stage: Exclude<AnnualReviewerRole, 'self'>;
  reviewerId: string | null;
  reason: OrphanReason;
  /** True when the workflow is currently *waiting* on this broken stage. */
  isCurrentStage: boolean;
}

function reviewerFor(
  inst: OrphanCandidateInstance,
  stage: Exclude<AnnualReviewerRole, 'self'>,
): string | null {
  switch (stage) {
    case 'manager': return inst.manager_id;
    case 'skip_manager': return inst.skip_id;
    case 'dept_head': return inst.dept_head_id;
    case 'bu_head': return inst.bu_head_id;
    case 'hr': return inst.hr_id;
    case 'management': return inst.management_id ?? null;
  }
}

/**
 * Classifies every enabled non-self stage of an instance.
 * `activeById` maps reviewer id -> is_active; missing entries count as inactive.
 */
export function findOrphanedStages(
  inst: OrphanCandidateInstance,
  activeById: Record<string, boolean>,
): OrphanFinding[] {
  if (TERMINAL_STATUSES.includes(inst.overall_status)) return [];

  const out: OrphanFinding[] = [];
  for (const stage of inst.enabled_stages) {
    if (stage === 'self') continue;
    const reviewerId = reviewerFor(inst, stage);
    let reason: OrphanReason | null = null;
    if (!reviewerId) reason = 'no_reviewer_mapped';
    else if (activeById[reviewerId] !== true) reason = 'inactive_reviewer';
    if (!reason) continue;
    out.push({
      instanceId: inst.id,
      employeeId: inst.employee_id,
      stage,
      reviewerId,
      reason,
      isCurrentStage: inst.overall_status === STAGE_STATUS[stage],
    });
  }
  return out;
}

/** Orphans that actively block the workflow right now. */
export function blockingOrphans(findings: OrphanFinding[]): OrphanFinding[] {
  return findings.filter((f) => f.isCurrentStage);
}
