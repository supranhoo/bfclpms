import type { AnnualReviewStatus, AnnualReviewerRole } from '@/types/annualReview';
import { STAGE_TO_STATUS } from './constants';

/**
 * SSOT for the per-employee configurable annual review chain.
 *
 * The canonical chain is `self → manager → skip_manager → bu_head → hr`.
 * Each instance carries an `enabled_stages` array that is a subset of the
 * canonical order. Any stage (including `self`) may be disabled, but the
 * resulting chain MUST contain at least one stage. Disabled stages are
 * skipped entirely (advance jumps past them; send-back jumps back past them).
 *
 * UI components MUST go through these helpers — never hardcode the chain.
 */

export const ALL_STAGES: readonly AnnualReviewerRole[] = [
  'self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr',
] as const;

const STAGE_LABEL_DEFAULT: Record<AnnualReviewerRole, string> = {
  self: 'Self', manager: 'Manager', skip_manager: 'Skip', dept_head: 'Dept', bu_head: 'BU', hr: 'HR',
};

function statusToRole(status: AnnualReviewStatus): AnnualReviewerRole | null {
  switch (status) {
    case 'pending_self':    return 'self';
    case 'pending_manager': return 'manager';
    case 'pending_skip':    return 'skip_manager';
    case 'pending_dept':    return 'dept_head';
    case 'pending_bu':      return 'bu_head';
    case 'pending_hr':      return 'hr';
    default: return null;
  }
}

/** Default chain when an instance hasn't loaded its `enabled_stages` yet. */
export const DEFAULT_ENABLED: AnnualReviewerRole[] = [...ALL_STAGES];

/** Normalise: dedupe, drop unknowns, preserve canonical order. At least one stage required. */
export function enabledChain(enabled: AnnualReviewerRole[] | null | undefined): AnnualReviewerRole[] {
  const set = new Set<AnnualReviewerRole>(enabled?.length ? enabled : DEFAULT_ENABLED);
  const chain = ALL_STAGES.filter((s) => set.has(s));
  if (chain.length === 0) {
    throw new Error('enabledChain: at least one stage must be enabled');
  }
  return chain;
}

/** Given current pending status, return the next status using the enabled chain. */
export function nextStatus(
  current: AnnualReviewStatus,
  enabled: AnnualReviewerRole[] | null | undefined,
): AnnualReviewStatus {
  const chain = enabledChain(enabled);
  const role = statusToRole(current);
  if (!role) return current;
  const idx = chain.indexOf(role);
  if (idx < 0 || idx >= chain.length - 1) return 'completed';
  return STAGE_TO_STATUS[chain[idx + 1]];
}

/** Previous status for send-back. Throws if no prior stage exists. */
export function prevStatus(
  role: AnnualReviewerRole,
  enabled: AnnualReviewerRole[] | null | undefined,
): AnnualReviewStatus {
  const chain = enabledChain(enabled);
  const idx = chain.indexOf(role);
  if (idx <= 0) throw new Error(`no previous stage for ${role}`);
  return STAGE_TO_STATUS[chain[idx - 1]];
}

/** Human-readable comma-separated list (used in workflow override dialogs). */
export function describeChain(enabled: AnnualReviewerRole[] | null | undefined): string {
  return enabledChain(enabled).map((s) => STAGE_LABEL_DEFAULT[s]).join(' → ');
}