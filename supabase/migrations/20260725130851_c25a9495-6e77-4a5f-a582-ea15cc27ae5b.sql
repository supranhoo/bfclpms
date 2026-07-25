CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text,
  p_mode text DEFAULT 'safe'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_instance public.annual_review_instances;
  v_prev jsonb;
  v_added_roles text[];
  v_removed_roles text[];
  v_has_responses boolean;
  v_status public.annual_review_status;
  v_new_status public.annual_review_status;
  v_employee_id uuid;
BEGIN
  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can edit workflow stages.';
  END IF;
  IF p_mode NOT IN ('safe','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR jsonb_array_length(p_enabled_stages) = 0 THEN
    RAISE EXCEPTION 'At least one stage must be enabled.';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;
  v_employee_id := v_instance.employee_id;
  v_status := v_instance.overall_status;
  v_prev := COALESCE(v_instance.enabled_stages, '[]'::jsonb);

  SELECT array_agg(x) INTO v_added_roles
    FROM (SELECT jsonb_array_elements_text(p_enabled_stages) EXCEPT SELECT jsonb_array_elements_text(v_prev)) t(x);
  SELECT array_agg(x) INTO v_removed_roles
    FROM (SELECT jsonb_array_elements_text(v_prev) EXCEPT SELECT jsonb_array_elements_text(p_enabled_stages)) t(x);
  v_added_roles := COALESCE(v_added_roles, ARRAY[]::text[]);
  v_removed_roles := COALESCE(v_removed_roles, ARRAY[]::text[]);

  SELECT EXISTS(
    SELECT 1 FROM public.annual_review_responses
     WHERE instance_id = p_instance_id AND is_locked = true
  ) INTO v_has_responses;

  IF p_mode = 'safe' AND v_has_responses AND array_length(v_removed_roles, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot remove stages once locked responses exist. Use supersede mode.';
  END IF;

  IF p_mode = 'supersede' THEN
    PERFORM public.archive_annual_review_response(id, 'ADR-160: stage superseded — ' || COALESCE(p_reason,''))
      FROM public.annual_review_responses
     WHERE instance_id = p_instance_id
       AND is_locked = true
       AND reviewer_role::text = ANY(v_removed_roles);

    SELECT CASE lower(s)
             WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
             WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
             WHEN 'dept_head'    THEN 'pending_dept'::public.annual_review_status
             WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
             WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
             WHEN 'management'   THEN 'pending_management'::public.annual_review_status
             WHEN 'self'         THEN 'pending_self'::public.annual_review_status
           END
      INTO v_new_status
      FROM jsonb_array_elements_text(p_enabled_stages) s
     WHERE lower(s) <> 'self'
     LIMIT 1;

    IF v_new_status IS NULL THEN
      v_new_status := 'pending_self'::public.annual_review_status;
    END IF;

    UPDATE public.annual_review_instances
       SET total_score = NULL,
           final_rating = NULL,
           criteria_weighted_score = NULL,
           finalized_at = NULL,
           finalized_by = NULL
     WHERE id = p_instance_id;
  ELSE
    v_new_status := v_status;
  END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         manager_id     = CASE WHEN p_enabled_stages ? 'manager'      THEN manager_id     ELSE NULL END,
         skip_id        = CASE WHEN p_enabled_stages ? 'skip_manager' THEN skip_id        ELSE NULL END,
         dept_head_id   = CASE WHEN p_enabled_stages ? 'dept_head'    THEN dept_head_id   ELSE NULL END,
         bu_head_id     = CASE WHEN p_enabled_stages ? 'bu_head'      THEN bu_head_id     ELSE NULL END,
         hr_id          = CASE WHEN p_enabled_stages ? 'hr'           THEN hr_id          ELSE NULL END,
         management_id  = CASE WHEN p_enabled_stages ? 'management'   THEN management_id  ELSE NULL END,
         overall_status = CASE
            WHEN p_mode = 'supersede' THEN v_new_status
            WHEN v_status = 'not_started' THEN v_status
            WHEN v_has_responses THEN v_status
            ELSE v_new_status
         END,
         has_admin_workflow_override = true,
         updated_at = now()
   WHERE id = p_instance_id;

  DELETE FROM public.annual_review_assignment_overrides
   WHERE instance_id = p_instance_id
     AND role::text = ANY(v_removed_roles);

  INSERT INTO public.annual_review_access_audit(action, actor_id, target_user_id, after, reason)
  VALUES (
    'workflow_edited_post_action', v_caller, v_employee_id,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'prev_stages', v_prev,
      'new_stages', p_enabled_stages,
      'added', to_jsonb(v_added_roles),
      'removed', to_jsonb(v_removed_roles),
      'mode', p_mode,
      'prior_status', v_status,
      'new_status', v_new_status
    ),
    p_reason
  );
END; $$;