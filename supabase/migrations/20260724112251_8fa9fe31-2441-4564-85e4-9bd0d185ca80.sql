-- ADR-155b: repair Sindhu Raj Singh (101089). enabled_stages=[self,management]
-- with self locked, but overall_status was 'pending_dept'. Advance to pending_management.
-- Reuse existing allowed audit action 'management_stage.backfilled' so we stay within
-- the current annual_review_access_audit_action_check constraint.
WITH upd AS (
  UPDATE public.annual_review_instances
  SET overall_status = 'pending_management', updated_at = now()
  WHERE id = 'd84ceb0a-4147-43b2-9bd3-d2ea585525a7'
    AND overall_status = 'pending_dept'
    AND enabled_stages ? 'management'
    AND NOT (enabled_stages ? 'dept_head')
  RETURNING employee_id
)
INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
SELECT NULL, employee_id, 'management_stage.backfilled',
       jsonb_build_object('overall_status','pending_dept'),
       jsonb_build_object('overall_status','pending_management'),
       'ADR-155b status repair: enabled_stages=[self,management] but status was pending_dept; advanced to pending_management (self locked). Employee 101089 (Sindhu Raj Singh).'
FROM upd;