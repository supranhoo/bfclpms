/**
 * ADR-299 — Audit action vocabulary must match the CHECK allowlist.
 *
 * RCA: `alert_on_reviewer_deactivation` inserted
 * `action = 'reviewer_deactivated_orphan_risk'` into
 * `public.annual_review_access_audit`, but the table's CHECK constraint did not
 * list that value. The failed insert aborted the parent `profiles` UPDATE, so
 * admins could not deactivate any employee who still owned pending annual-review
 * stages or headed a BU/department.
 *
 * This test is the SSOT guard: every action literal a producer writes must be a
 * member of the allowlist. Add new actions to BOTH lists in the same change.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors `annual_review_access_audit_action_check` (post ADR-299). */
export const AUDIT_ACTION_ALLOWLIST = [
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
  'admin_edit',
  'system_scores.admin_correction',
  'recommendation.saved',
  'recommendation.decided',
  'recommendation.bulk_decided',
  'reviewer_deactivated_orphan_risk',
] as const;

/** Action literals written by database producers (triggers / RPCs). */
export const AUDIT_ACTIONS_WRITTEN_BY_PRODUCERS = [
  'reviewer_deactivated_orphan_risk', // alert_on_reviewer_deactivation
  'workflow_edited_post_action', // annual_review_edit_workflow
  'reviewer_reassigned_supersede', // reassign_annual_review_reviewer
  'system_scores.admin_override', // admin_update_system_scores_raw
  'system_scores.admin_correction', // admin_apply_system_scores_correction
  'management_stage.backfilled', // backfill_management_stage_for_manager
  'recommendation.saved', // ar_save_recommendation
  'recommendation.decided', // ar_decide_recommendation
  'recommendation.bulk_decided', // ar_bulk_decide_recommendations
  'override_upserted', // upsert_annual_review_directory_override
  'override_deleted', // delete_annual_review_directory_override
  'kill_switch_toggled', // set_annual_review_access_setting
] as const;

describe('annual_review_access_audit action vocabulary (ADR-299)', () => {
  it('allows every action a producer writes', () => {
    const missing = AUDIT_ACTIONS_WRITTEN_BY_PRODUCERS.filter(
      (a) => !AUDIT_ACTION_ALLOWLIST.includes(a as never),
    );
    expect(missing).toEqual([]);
  });

  it('covers the reviewer-deactivation alert that caused the outage', () => {
    expect(AUDIT_ACTION_ALLOWLIST).toContain('reviewer_deactivated_orphan_risk');
  });

  it('has no duplicate entries', () => {
    expect(new Set(AUDIT_ACTION_ALLOWLIST).size).toBe(AUDIT_ACTION_ALLOWLIST.length);
  });
});
