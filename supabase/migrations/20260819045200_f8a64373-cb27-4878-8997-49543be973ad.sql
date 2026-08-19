ALTER TABLE public.annual_review_access_audit
  DROP CONSTRAINT IF EXISTS annual_review_access_audit_action_check;

ALTER TABLE public.annual_review_access_audit
  ADD CONSTRAINT annual_review_access_audit_action_check CHECK (
    action = ANY (ARRAY[
      'kill_switch_toggled'::text,
      'override_upserted'::text,
      'override_deleted'::text,
      'management_stage.backfilled'::text,
      'management_stage.backfilled_bulk'::text,
      'management_stage.reverted'::text,
      'management_stage.reverted_after'::text,
      'bu_terminal_restore'::text,
      'collapse_normalise'::text,
      'workflow_edited_post_action'::text,
      'reviewer_reassigned_supersede'::text,
      'system_scores.admin_override'::text,
      'admin_edit'::text,
      'system_scores.admin_correction'::text,
      'recommendation.saved'::text,
      'recommendation.decided'::text,
      'recommendation.bulk_decided'::text,
      'reviewer_deactivated_orphan_risk'::text
    ])
  );