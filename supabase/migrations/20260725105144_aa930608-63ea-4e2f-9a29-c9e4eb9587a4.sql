
-- ADR-167: Drop-and-recreate to avoid parameter-name-change errors.
DROP FUNCTION IF EXISTS public.annual_review_edit_workflow(uuid, jsonb, jsonb, text, text);
DROP FUNCTION IF EXISTS public.set_annual_review_enabled_stages(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS public.reassign_annual_review_reviewer(uuid, text, uuid, text, text);

CREATE FUNCTION public.set_annual_review_enabled_stages(
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
             WHEN 'dept_head'    THEN 'pending_dept_head'::public.annual_review_status
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
           weighted_final_score = NULL,
           completed_at = NULL
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
      'new_stages',  p_enabled_stages,
      'added',       to_jsonb(v_added_roles),
      'removed',     to_jsonb(v_removed_roles),
      'mode',        p_mode,
      'prior_status', v_status,
      'new_status',   v_new_status
    ),
    p_reason
  );
END; $$;

CREATE FUNCTION public.reassign_annual_review_reviewer(
  p_instance_id uuid,
  p_role text,
  p_new_reviewer_id uuid,
  p_reason text,
  p_mode text DEFAULT 'redirect'
) RETURNS public.annual_review_assignment_overrides
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_override public.annual_review_assignment_overrides;
  v_instance public.annual_review_instances;
  v_locked_resp public.annual_review_responses;
  v_old_reviewer uuid;
  v_target_status public.annual_review_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can reassign reviewers.';
  END IF;
  IF p_role NOT IN ('manager','skip_manager','dept_head','bu_head','hr','management') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;
  IF p_new_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'A reviewer must be selected.';
  END IF;
  IF p_mode NOT IN ('redirect','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;
  IF v_instance.employee_id = p_new_reviewer_id THEN
    RAISE EXCEPTION 'Reviewer cannot be the employee under review.';
  END IF;

  IF p_role = 'management' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.user_id = p_new_reviewer_id AND ur.role = 'management' AND p.is_active = true
    ) THEN
      RAISE EXCEPTION 'Selected user is not an active Management user.';
    END IF;
  END IF;

  v_old_reviewer := CASE p_role
    WHEN 'manager'      THEN v_instance.manager_id
    WHEN 'skip_manager' THEN v_instance.skip_id
    WHEN 'dept_head'    THEN v_instance.dept_head_id
    WHEN 'bu_head'      THEN v_instance.bu_head_id
    WHEN 'hr'           THEN v_instance.hr_id
    WHEN 'management'   THEN v_instance.management_id
  END;

  IF p_mode = 'supersede' THEN
    SELECT * INTO v_locked_resp FROM public.annual_review_responses
     WHERE instance_id = p_instance_id
       AND reviewer_role = p_role::public.annual_reviewer_role
       AND is_locked = true;
    IF v_locked_resp.id IS NOT NULL THEN
      PERFORM public.archive_annual_review_response(
        v_locked_resp.id,
        'ADR-160: reviewer superseded — ' || COALESCE(p_reason,'')
      );
    END IF;

    v_target_status := CASE p_role
      WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
      WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
      WHEN 'dept_head'    THEN 'pending_dept_head'::public.annual_review_status
      WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
      WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
      WHEN 'management'   THEN 'pending_management'::public.annual_review_status
    END;
  END IF;

  INSERT INTO public.annual_review_assignment_overrides
    (instance_id, role, new_reviewer_id, reason, created_by)
  VALUES (p_instance_id, p_role, p_new_reviewer_id, p_reason, auth.uid())
  ON CONFLICT (instance_id, role) DO UPDATE
    SET new_reviewer_id = EXCLUDED.new_reviewer_id,
        reason = EXCLUDED.reason,
        created_by = auth.uid(),
        created_at = now()
  RETURNING * INTO v_override;

  UPDATE public.annual_review_instances
     SET manager_id     = CASE WHEN p_role = 'manager'      THEN p_new_reviewer_id ELSE manager_id END,
         skip_id        = CASE WHEN p_role = 'skip_manager' THEN p_new_reviewer_id ELSE skip_id END,
         dept_head_id   = CASE WHEN p_role = 'dept_head'    THEN p_new_reviewer_id ELSE dept_head_id END,
         bu_head_id     = CASE WHEN p_role = 'bu_head'      THEN p_new_reviewer_id ELSE bu_head_id END,
         hr_id          = CASE WHEN p_role = 'hr'           THEN p_new_reviewer_id ELSE hr_id END,
         management_id  = CASE WHEN p_role = 'management'   THEN p_new_reviewer_id ELSE management_id END,
         overall_status = CASE WHEN p_mode = 'supersede' THEN v_target_status ELSE overall_status END,
         has_admin_workflow_override = true,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    CASE WHEN p_mode = 'supersede'
         THEN 'annual_review.reviewer_reassigned_supersede'
         ELSE 'annual_review.reviewer_reassigned' END,
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id, 'role', p_role,
      'old_reviewer_id', v_old_reviewer,
      'new_reviewer_id', p_new_reviewer_id,
      'mode', p_mode, 'reason', p_reason
    )
  );

  IF p_mode = 'supersede' THEN
    INSERT INTO public.annual_review_access_audit(action, actor_id, target_user_id, after, reason)
    VALUES (
      'reviewer_reassigned_supersede', auth.uid(), v_instance.employee_id,
      jsonb_build_object(
        'instance_id', p_instance_id,
        'role', p_role,
        'old_reviewer_id', v_old_reviewer,
        'new_reviewer_id', p_new_reviewer_id,
        'target_status', v_target_status
      ),
      p_reason
    );
  END IF;

  RETURN v_override;
END; $$;

CREATE FUNCTION public.annual_review_edit_workflow(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reviewer_overrides jsonb,
  p_reason text,
  p_mode text DEFAULT 'safe'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_stage_mode text;
  v_reviewer_mode text;
  v_reviewer_summary jsonb := '[]'::jsonb;
  v_employee_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can edit workflow.';
  END IF;
  IF p_mode NOT IN ('safe','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_mode = 'supersede' AND (p_reason IS NULL OR length(trim(p_reason)) < 10) THEN
    RAISE EXCEPTION 'supersede mode requires a reason of at least 10 characters';
  END IF;

  SELECT employee_id INTO v_employee_id FROM public.annual_review_instances WHERE id = p_instance_id;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;

  v_stage_mode    := p_mode;
  v_reviewer_mode := CASE WHEN p_mode = 'supersede' THEN 'supersede' ELSE 'redirect' END;

  IF p_enabled_stages IS NOT NULL AND jsonb_typeof(p_enabled_stages) = 'array' THEN
    PERFORM public.set_annual_review_enabled_stages(
      p_instance_id, p_enabled_stages, p_reason, v_stage_mode
    );
  END IF;

  IF p_reviewer_overrides IS NOT NULL AND jsonb_typeof(p_reviewer_overrides) = 'object' THEN
    FOR r IN
      SELECT key AS role, value #>> '{}' AS reviewer_id
        FROM jsonb_each(p_reviewer_overrides)
    LOOP
      IF r.reviewer_id IS NOT NULL AND r.reviewer_id <> '' THEN
        PERFORM public.reassign_annual_review_reviewer(
          p_instance_id, r.role, r.reviewer_id::uuid, p_reason, v_reviewer_mode
        );
        v_reviewer_summary := v_reviewer_summary
          || jsonb_build_array(jsonb_build_object('role', r.role, 'new_reviewer_id', r.reviewer_id));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.annual_review_access_audit(action, actor_id, target_user_id, after, reason)
  VALUES (
    'workflow_edited_post_action', auth.uid(), v_employee_id,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'summary', true,
      'mode', p_mode,
      'stages', p_enabled_stages,
      'reviewer_changes', v_reviewer_summary
    ),
    p_reason
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.set_annual_review_enabled_stages(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_annual_review_reviewer(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_edit_workflow(uuid, jsonb, jsonb, text, text) TO authenticated;
