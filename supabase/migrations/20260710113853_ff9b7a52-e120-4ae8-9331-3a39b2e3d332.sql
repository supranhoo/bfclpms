
CREATE OR REPLACE FUNCTION public.bulk_restore_annual_review_instances(
  p_instance_ids uuid[],
  p_reason text
) RETURNS TABLE(instance_id uuid, status text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_row public.annual_review_instances;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_annual_review_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: HR/Admin only';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required (min 3 chars)';
  END IF;
  IF coalesce(array_length(p_instance_ids,1),0) = 0 THEN
    RETURN;
  END IF;
  IF array_length(p_instance_ids,1) > 500 THEN
    RAISE EXCEPTION 'batch too large (max 500)';
  END IF;

  FOREACH v_id IN ARRAY p_instance_ids LOOP
    SELECT * INTO v_row FROM public.annual_review_instances WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      instance_id := v_id; status := 'skipped'; message := 'not found'; RETURN NEXT; CONTINUE;
    END IF;
    IF v_row.overall_status <> 'excluded' THEN
      instance_id := v_id; status := 'skipped';
      message := 'not excluded: ' || v_row.overall_status::text;
      RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.annual_review_instances
       SET overall_status = 'not_started'::annual_review_status,
           excluded_at = NULL, excluded_by = NULL, excluded_reason = NULL,
           updated_at = now()
     WHERE id = v_id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.instance.restored', v_uid,
      jsonb_build_object('instance_id', v_id, 'employee_id', v_row.employee_id,
                         'cycle_id', v_row.cycle_id, 'reason', btrim(p_reason), 'bulk', true));
    instance_id := v_id; status := 'restored'; message := NULL; RETURN NEXT;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bulk_action', v_uid,
    jsonb_build_object('kind','restore','count', array_length(p_instance_ids,1),'reason', btrim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_restore_annual_review_instances(uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_restore_annual_review_instances(uuid[],text) TO authenticated;
