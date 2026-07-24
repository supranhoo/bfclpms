ALTER TABLE public.annual_review_access_audit
  DROP CONSTRAINT annual_review_access_audit_action_check;
ALTER TABLE public.annual_review_access_audit
  ADD CONSTRAINT annual_review_access_audit_action_check
  CHECK (action = ANY (ARRAY[
    'kill_switch_toggled',
    'override_upserted',
    'override_deleted',
    'management_stage.backfilled',
    'management_stage.backfilled_bulk',
    'management_stage.reverted',
    'management_stage.reverted_after'
  ]));