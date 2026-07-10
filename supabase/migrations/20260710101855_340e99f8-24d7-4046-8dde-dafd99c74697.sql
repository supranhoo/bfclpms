
-- Guard helper for HR/admin scope
CREATE OR REPLACE FUNCTION public.is_annual_review_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(_uid, 'admin'::app_role) OR has_role(_uid, 'hr_pms'::app_role);
$$;

-- Exclude a single instance (only pre-self-review)
CREATE OR REPLACE FUNCTION public.exclude_annual_review_instance(
  p_instance_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.annual_review_instances;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_annual_review_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: HR/Admin only';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required (min 3 chars)';
  END IF;
  SELECT * INTO v_row FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance not found'; END IF;
  IF v_row.overall_status NOT IN ('not_started','pending_self') THEN
    RAISE EXCEPTION 'cannot exclude: review already past self stage (current: %)', v_row.overall_status;
  END IF;

  UPDATE public.annual_review_instances
     SET overall_status = 'excluded'::annual_review_status,
         excluded_at = now(),
         excluded_by = v_uid,
         excluded_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.instance.excluded', v_uid,
    jsonb_build_object('instance_id', p_instance_id, 'employee_id', v_row.employee_id,
                       'cycle_id', v_row.cycle_id, 'prev_status', v_row.overall_status,
                       'reason', btrim(p_reason)));

  RETURN jsonb_build_object('ok', true, 'instance_id', p_instance_id);
END;
$$;

-- Restore excluded instance -> not_started
CREATE OR REPLACE FUNCTION public.restore_annual_review_instance(
  p_instance_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.annual_review_instances;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_annual_review_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: HR/Admin only';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required (min 3 chars)';
  END IF;
  SELECT * INTO v_row FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance not found'; END IF;
  IF v_row.overall_status <> 'excluded' THEN
    RAISE EXCEPTION 'instance is not excluded';
  END IF;

  UPDATE public.annual_review_instances
     SET overall_status = 'not_started'::annual_review_status,
         excluded_at = NULL,
         excluded_by = NULL,
         excluded_reason = NULL,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.instance.restored', v_uid,
    jsonb_build_object('instance_id', p_instance_id, 'employee_id', v_row.employee_id,
                       'cycle_id', v_row.cycle_id, 'reason', btrim(p_reason)));

  RETURN jsonb_build_object('ok', true, 'instance_id', p_instance_id);
END;
$$;

-- Bulk exclude — returns per-row result
CREATE OR REPLACE FUNCTION public.bulk_exclude_annual_review_instances(
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
    IF v_row.overall_status NOT IN ('not_started','pending_self') THEN
      instance_id := v_id; status := 'skipped';
      message := 'past self stage: ' || v_row.overall_status::text;
      RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.annual_review_instances
       SET overall_status = 'excluded'::annual_review_status,
           excluded_at = now(), excluded_by = v_uid,
           excluded_reason = btrim(p_reason), updated_at = now()
     WHERE id = v_id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.instance.excluded', v_uid,
      jsonb_build_object('instance_id', v_id, 'employee_id', v_row.employee_id,
                         'cycle_id', v_row.cycle_id, 'reason', btrim(p_reason), 'bulk', true));
    instance_id := v_id; status := 'excluded'; message := NULL; RETURN NEXT;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bulk_action', v_uid,
    jsonb_build_object('kind','exclude','count', array_length(p_instance_ids,1),'reason', btrim(p_reason)));
END;
$$;

-- Bulk add employees to cycle (delegates to existing create_or_get)
CREATE OR REPLACE FUNCTION public.bulk_create_annual_review_instances(
  p_employee_ids uuid[],
  p_cycle_id uuid
) RETURNS TABLE(employee_id uuid, instance_id uuid, status text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_res record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_annual_review_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: HR/Admin only';
  END IF;
  IF coalesce(array_length(p_employee_ids,1),0) = 0 THEN RETURN; END IF;
  IF array_length(p_employee_ids,1) > 500 THEN
    RAISE EXCEPTION 'batch too large (max 500)';
  END IF;

  FOREACH v_emp IN ARRAY p_employee_ids LOOP
    BEGIN
      SELECT * INTO v_res FROM public.create_or_get_annual_review_instance(v_emp, p_cycle_id) LIMIT 1;
      employee_id := v_emp;
      instance_id := v_res.instance_id;
      status := CASE WHEN v_res.was_created THEN 'created' ELSE 'existing' END;
      message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      employee_id := v_emp; instance_id := NULL; status := 'error'; message := SQLERRM; RETURN NEXT;
    END;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bulk_action', v_uid,
    jsonb_build_object('kind','add','cycle_id',p_cycle_id,'count', array_length(p_employee_ids,1)));
END;
$$;

-- Bulk re-map template override
CREATE OR REPLACE FUNCTION public.bulk_set_annual_review_template_override(
  p_instance_ids uuid[],
  p_template_id uuid,
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
  IF p_template_id IS NULL THEN RAISE EXCEPTION 'template required'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required (min 3 chars)';
  END IF;
  IF coalesce(array_length(p_instance_ids,1),0) = 0 THEN RETURN; END IF;
  IF array_length(p_instance_ids,1) > 500 THEN
    RAISE EXCEPTION 'batch too large (max 500)';
  END IF;

  FOREACH v_id IN ARRAY p_instance_ids LOOP
    SELECT * INTO v_row FROM public.annual_review_instances WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      instance_id := v_id; status := 'skipped'; message := 'not found'; RETURN NEXT; CONTINUE;
    END IF;
    IF v_row.overall_status NOT IN ('not_started','pending_self') THEN
      instance_id := v_id; status := 'skipped';
      message := 'past self stage: ' || v_row.overall_status::text;
      RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.annual_review_instances
       SET template_override_id = p_template_id, updated_at = now()
     WHERE id = v_id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.template_override.bulk', v_uid,
      jsonb_build_object('instance_id', v_id, 'employee_id', v_row.employee_id,
                         'cycle_id', v_row.cycle_id, 'template_id', p_template_id,
                         'reason', btrim(p_reason)));
    instance_id := v_id; status := 'remapped'; message := NULL; RETURN NEXT;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bulk_action', v_uid,
    jsonb_build_object('kind','remap','template_id',p_template_id,'count', array_length(p_instance_ids,1),'reason', btrim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.exclude_annual_review_instance(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_annual_review_instance(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_exclude_annual_review_instances(uuid[],text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_create_annual_review_instances(uuid[],uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_set_annual_review_template_override(uuid[],uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_annual_review_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.exclude_annual_review_instance(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_annual_review_instance(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_exclude_annual_review_instances(uuid[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_create_annual_review_instances(uuid[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_annual_review_template_override(uuid[],uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_annual_review_admin(uuid) TO authenticated;
