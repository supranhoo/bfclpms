import type { AnnualReviewerRole } from '@/types/annualReview';

/**
 * SSOT (TypeScript mirror of `public.annual_review_effective_chain_details`).
 *
 * Resolves which enabled stages remain active for an instance and why each
 * skipped stage was dropped. The authoritative implementation lives in SQL —
 * this helper exists for UI/reporting that needs the same answer without an
 * extra round-trip.
 *
 * Skip rules (evaluated per stage, in order):
 *   1. no_reviewer_mapped    — slot is null/undefined
 *   2. self_assignment       — reviewer equals the employee
 *   3. reviewer_inactive     — reviewer profile is_active === false
 *   4. duplicate_reviewer    — reviewer already kept at a HIGHER stage
 *
 * Duplicate detection runs **top-down by seniority** so the highest tier wins:
 *   hr → bu_head → dept_head → skip_manager → manager
 *
 * `self` is always kept and never participates in the dedup accumulator.
 */

export type SkipReason =
  | 'no_reviewer_mapped'
  | 'self_assignment'
  | 'reviewer_inactive'
  | 'duplicate_reviewer'
  | 'bu_head_terminal';

export interface StageResolution {
  stage: AnnualReviewerRole;
  reviewerId: string | null;
  skipped: boolean;
  skipReason: SkipReason | null;
  /** Set only when skipReason === 'duplicate_reviewer'. */
  duplicateOf: AnnualReviewerRole | null;
}

export interface ResolveInput {
  enabledStages: AnnualReviewerRole[];
  employeeId: string;
  reviewers: Partial<Record<Exclude<AnnualReviewerRole, 'self'>, string | null | undefined>>;
  /** Map of reviewer id → is_active flag. Missing entries are treated as inactive. */
  activeById: Record<string, boolean>;
  /**
   * POLICY §AR-BU-HEAD-TERMINAL — set true when the employee is themselves a
   * BU Head (id present in `business_units.head_user_id`). When true, the
   * `dept_head` stage is force-skipped regardless of who is configured, because
   * a BU Head does not report to a Dept Head.
   */
  employeeIsBuHead?: boolean;
}

const SENIORITY: AnnualReviewerRole[] = [
  'management', 'hr', 'bu_head', 'dept_head', 'skip_manager', 'manager', 'self',
];

const FORWARD: AnnualReviewerRole[] = [
  'self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr', 'management',
];

export function resolveEffectiveChain(input: ResolveInput): StageResolution[] {
  const enabled = new Set(input.enabledStages);
  const kept: Array<{ id: string; stage: AnnualReviewerRole }> = [];
  const seniorityRows: StageResolution[] = [];

  for (const stage of SENIORITY) {
    if (!enabled.has(stage)) continue;

    if (stage === 'self') {
      seniorityRows.push({
        stage, reviewerId: input.employeeId,
        skipped: false, skipReason: null, duplicateOf: null,
      });
      continue;
    }

    if (stage === 'dept_head' && input.employeeIsBuHead) {
      seniorityRows.push({
        stage, reviewerId: input.reviewers.dept_head ?? null,
        skipped: true, skipReason: 'bu_head_terminal', duplicateOf: null,
      });
      continue;
    }

    const reviewerId = input.reviewers[stage] ?? null;
    if (!reviewerId) {
      seniorityRows.push({ stage, reviewerId: null, skipped: true, skipReason: 'no_reviewer_mapped', duplicateOf: null });
      continue;
    }
    if (reviewerId === input.employeeId) {
      seniorityRows.push({ stage, reviewerId, skipped: true, skipReason: 'self_assignment', duplicateOf: null });
      continue;
    }
    if (input.activeById[reviewerId] !== true) {
      seniorityRows.push({ stage, reviewerId, skipped: true, skipReason: 'reviewer_inactive', duplicateOf: null });
      continue;
    }
    const dup = kept.find((k) => k.id === reviewerId);
    if (dup) {
      seniorityRows.push({ stage, reviewerId, skipped: true, skipReason: 'duplicate_reviewer', duplicateOf: dup.stage });
      continue;
    }
    kept.push({ id: reviewerId, stage });
    seniorityRows.push({ stage, reviewerId, skipped: false, skipReason: null, duplicateOf: null });
  }

  // Return rows in forward execution order to match the SQL `effective_chain` contract.
  return FORWARD.filter((s) => seniorityRows.some((r) => r.stage === s))
    .map((s) => seniorityRows.find((r) => r.stage === s)!);
}

/** Forward-ordered list of stages that survive after auto-skip. */
export function effectiveStages(input: ResolveInput): AnnualReviewerRole[] {
  return resolveEffectiveChain(input).filter((r) => !r.skipped).map((r) => r.stage);
}