
CREATE OR REPLACE FUNCTION public.resync_annual_review_dept_head(
  p_cycle_id uuid,
  p_dept_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_new_head uuid;
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT (public.has_role(v_actor, 'admin'::app_role) OR public.has_role(v_actor, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized to resync department head';
  END IF;

  SELECT head_user_id INTO v_new_head FROM public.departments WHERE id = p_dept_id;
  IF v_new_head IS NULL THEN
    RAISE EXCEPTION 'Department % has no head configured', p_dept_id;
  END IF;

  -- Safe stages to rewrite: dept head has not yet actioned.
  WITH candidates AS (
    SELECT ari.id, ari.overall_status
      FROM public.annual_review_instances ari
      JOIN public.profiles p ON p.id = ari.employee_id
     WHERE ari.cycle_id = p_cycle_id
       AND p.department_id = p_dept_id
       AND ari.finalized_at IS NULL
  ),
  upd AS (
    UPDATE public.annual_review_instances ari
       SET dept_head_id = v_new_head,
           updated_at = now()
      FROM candidates c
     WHERE ari.id = c.id
       AND c.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept')
       AND ari.dept_head_id IS DISTINCT FROM v_new_head
    RETURNING ari.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  SELECT count(*) INTO v_skipped
    FROM public.annual_review_instances ari
    JOIN public.profiles p ON p.id = ari.employee_id
   WHERE ari.cycle_id = p_cycle_id
     AND p.department_id = p_dept_id
     AND ari.finalized_at IS NULL
     AND ari.overall_status IN ('pending_bu','pending_hr','completed');

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.dept_head.resynced',
    v_actor,
    jsonb_build_object(
      'cycle_id', p_cycle_id,
      'department_id', p_dept_id,
      'new_dept_head_id', v_new_head,
      'instances_updated', v_updated,
      'instances_skipped_downstream', v_skipped
    )
  );

  RETURN jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'new_head_id', v_new_head);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_annual_review_dept_head(uuid, uuid) TO authenticated;
