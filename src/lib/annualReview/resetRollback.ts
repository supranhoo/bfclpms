/**
 * ADR-210 / POLICY §AR-RESET-ROLLBACK
 *
 * SSOT for rolling an annual review instance back after an erroneous
 * force-reset. `annual_review_reset_archive` is the authoritative source of
 * the pre-reset state: it carries `prior_status`, `prior_template_id` and the
 * verbatim `wiped_responses` payload.
 *
 * Pure functions only — the caller performs the writes.
 */

import { ALL_STAGES } from './stageChain';
import type { AnnualReviewerRole } from '@/types/annualReview';

export interface ArchivedResponse {
  id: string;
  instance_id: string;
  reviewer_id: string;
  reviewer_role: string;
  criteria_scores?: Record<string, unknown> | null;
  qualitative_responses?: Record<string, unknown> | null;
  evidence?: unknown[] | null;
  weighted_score?: number | string | null;
  submitted_at?: string | null;
  is_locked?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ResetArchiveRow {
  id: string;
  instance_id: string;
  prior_status: string | null;
  prior_template_id: string | null;
  wiped_responses: ArchivedResponse[] | Record<string, unknown> | null;
}

export interface RollbackPlan {
  /** Responses to re-insert verbatim (locked state preserved). */
  responses: ArchivedResponse[];
  /** Status to re-anchor the instance to. */
  targetStatus: string;
  /** Template to restore so archived answer keys resolve. */
  targetTemplateId: string | null;
  /** Reviewer mappings are NEVER rolled back — newer remaps win. */
  preserveReviewerMappings: true;
}

const ROLE_TO_STATUS: Record<string, string> = {
  self: 'pending_self',
  manager: 'pending_manager',
  skip_manager: 'pending_skip',
  dept_head: 'pending_dept',
  bu_head: 'pending_bu',
  hr: 'pending_hr',
  management: 'pending_management',
};

/** Only array payloads are real response lists; older archives stored an instance snapshot object. */
export function extractArchivedResponses(
  wiped: ResetArchiveRow['wiped_responses'],
): ArchivedResponse[] {
  if (!Array.isArray(wiped)) return [];
  return wiped.filter(
    (r): r is ArchivedResponse =>
      !!r && typeof r === 'object' && typeof (r as ArchivedResponse).id === 'string',
  );
}

/**
 * Re-anchor the archived `prior_status` against the instance's CURRENT
 * `enabled_stages`. A prior status whose stage is no longer enabled must not
 * be restored verbatim — fall back to the first enabled stage with no
 * restored locked response, else `completed`.
 */
export function resolveRollbackStatus(
  priorStatus: string | null,
  enabledStages: readonly string[],
  restoredResponses: readonly ArchivedResponse[],
): string {
  const enabled = ALL_STAGES.filter(s => enabledStages.includes(s)) as AnnualReviewerRole[];
  const lockedRoles = new Set(
    restoredResponses.filter(r => r.is_locked !== false).map(r => r.reviewer_role),
  );

  if (priorStatus && priorStatus !== 'not_started') {
    const stage = enabled.find(s => ROLE_TO_STATUS[s] === priorStatus);
    if (stage || priorStatus === 'completed') return priorStatus;
  }

  const next = enabled.find(s => !lockedRoles.has(s));
  return next ? ROLE_TO_STATUS[next] : 'completed';
}

export function buildRollbackPlan(
  archive: ResetArchiveRow,
  enabledStages: readonly string[],
): RollbackPlan {
  const responses = extractArchivedResponses(archive.wiped_responses);
  return {
    responses,
    targetStatus: resolveRollbackStatus(archive.prior_status, enabledStages, responses),
    targetTemplateId: archive.prior_template_id ?? null,
    preserveReviewerMappings: true,
  };
}
