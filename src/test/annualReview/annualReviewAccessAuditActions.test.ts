import { describe, it, expect } from 'vitest';

/**
 * ADR-217a regression guard.
 *
 * `admin_update_system_scores_raw` writes an audit row into
 * `public.annual_review_access_audit`. That table has a CHECK constraint
 * whitelisting the allowed `action` labels. The RPC originally wrote
 * `system_scores.admin_edit` while the whitelist only contained
 * `system_scores.admin_override`, so every admin System Score correction was
 * rolled back with a check-constraint violation.
 *
 * These constants mirror the DB. If either side is changed, update both and
 * keep this test green.
 */
export const ANNUAL_REVIEW_ACCESS_AUDIT_ACTIONS = [
  'kill_switch_toggled',
  'override_upserted',
  'override_deleted',
  'management_stage.backfilled',
  'management_stage.backfilled_bulk',
  'management_stage.reverted',
  'management_stage.reverted_after',
  'bu_terminal_restore',
  'collapse_normalise',
  'workflow_edited_post_action',
  'reviewer_reassigned_supersede',
  'system_scores.admin_override',
  'system_scores.admin_edit',
] as const;

export const SYSTEM_SCORE_ADMIN_AUDIT_ACTION = 'system_scores.admin_override';

describe('annual_review_access_audit action whitelist (ADR-217a)', () => {
  it('accepts the canonical system score correction label', () => {
    expect(ANNUAL_REVIEW_ACCESS_AUDIT_ACTIONS).toContain(SYSTEM_SCORE_ADMIN_AUDIT_ACTION);
  });

  it('still tolerates the legacy admin_edit label', () => {
    expect(ANNUAL_REVIEW_ACCESS_AUDIT_ACTIONS).toContain('system_scores.admin_edit');
  });

  it('has no duplicate labels', () => {
    const set = new Set(ANNUAL_REVIEW_ACCESS_AUDIT_ACTIONS);
    expect(set.size).toBe(ANNUAL_REVIEW_ACCESS_AUDIT_ACTIONS.length);
  });
});
