
-- ADR-134 (CORRECTED SCOPE): Expose "was this instance sent back?" to the
-- employee and to their assigned reviewers so the UI can render an
-- explanatory banner (reason + who + when) after a send-back.
--
-- Reads the last `annual_review.send_back` row from system_audit_logs.
-- SECURITY DEFINER because system_audit_logs SELECT is admin-only under RLS.
-- The function itself is guarded to the employee and the reviewer slots on
-- the instance (manager, skip, dept_head, bu_head, hr), plus admin/hr_pms.
CREATE OR REPLACE FUNCTION public.annual_review_last_send_back(p_instance_id uuid)
RETURNS TABLE (
  sent_back_at   timestamptz,
  performed_by   uuid,
  performer_name text,
  from_stage     text,
  to_stage       text,
  reason         text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_inst   public.annual_review_instances%ROWTYPE;
  v_is_priv boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT v_is_priv AND v_caller NOT IN (
    v_inst.employee_id,
    v_inst.manager_id, v_inst.skip_id, v_inst.dept_head_id,
    v_inst.bu_head_id, v_inst.hr_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sal.created_at                   AS sent_back_at,
    sal.performed_by                 AS performed_by,
    p.full_name                      AS performer_name,
    (sal.metadata->>'from_stage')    AS from_stage,
    (sal.metadata->>'to_stage')      AS to_stage,
    NULLIF(sal.metadata->>'reason','') AS reason
  FROM public.system_audit_logs sal
  LEFT JOIN public.profiles p ON p.id = sal.performed_by
  WHERE sal.action = 'annual_review.send_back'
    AND (sal.metadata->>'instance_id') = p_instance_id::text
  ORDER BY sal.created_at DESC
  LIMIT 1;
END $function$;

GRANT EXECUTE ON FUNCTION public.annual_review_last_send_back(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.annual_review_last_send_back(uuid) IS
'ADR-134 — surfaces the most recent annual_review.send_back audit entry for an instance to the employee and to their assigned reviewers (plus admin/hr_pms). Powers the "your review was sent back" banner on the Employee Annual Review page.';
