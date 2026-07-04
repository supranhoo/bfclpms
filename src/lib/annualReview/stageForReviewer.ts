import type { AnnualReviewerRole, AnnualReviewStatus } from '@/types/annualReview';

/**
 * SSOT for mapping a pending review instance + current viewer uid to the
 * active reviewer role. MUST cover every `pending_*` status listed in
 * `stageChain.ts` so no reviewer stage ever locks itself out of the UI.
 *
 * Regression: `src/lib/annualReview/stageForReviewer.test.ts`.
 */

export interface StageReviewerInstance {
  overall_status: AnnualReviewStatus;
  manager_id: string | null;
  skip_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
}

export function stageForReviewer(
  inst: StageReviewerInstance,
  uid: string | null | undefined,
): AnnualReviewerRole | null {
  if (!uid) return null;
  switch (inst.overall_status) {
    case 'pending_manager': return inst.manager_id === uid ? 'manager' : null;
    case 'pending_skip':    return inst.skip_id === uid ? 'skip_manager' : null;
    case 'pending_dept':    return inst.dept_head_id === uid ? 'dept_head' : null;
    case 'pending_bu':      return inst.bu_head_id === uid ? 'bu_head' : null;
    case 'pending_hr':      return inst.hr_id === uid ? 'hr' : null;
    default: return null;
  }
}