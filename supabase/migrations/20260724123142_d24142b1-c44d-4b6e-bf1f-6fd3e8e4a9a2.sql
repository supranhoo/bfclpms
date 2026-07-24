
-- ADR-160b: email dispatch + summary audit for workflow edits

-- Helper: enqueue email safely (never breaks caller)
CREATE OR REPLACE FUNCTION public._ar_enqueue_email(
  p_template_key text,
  p_recipient_id uuid,
  p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_name  text;
BEGIN
  IF p_recipient_id IS NULL THEN RETURN; END IF;
  BEGIN
    SELECT email, full_name INTO v_email, v_name
      FROM public.profiles WHERE id = p_recipient_id;
    IF v_email IS NULL OR v_email = '' THEN RETURN; END IF;
    INSERT INTO public.email_dispatch_queue(template_key, recipient_email, recipient_name, metadata)
    VALUES (p_template_key, v_email, v_name, COALESCE(p_metadata,'{}'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END; $$;

GRANT EXECUTE ON FUNCTION public._ar_enqueue_email(text, uuid, jsonb) TO authenticated;

-- Extend set_annual_review_enabled_stages: min-10 reason on supersede + employee notice
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text,
  p_mode text DEFAULT 'safe'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_status public.annual_review_status;
  v_prev   jsonb;
  v_has_responses boolean;
  v_new_status public.annual_review_status;
  r_resp public.annual_review_responses;
  v_removed_roles text[];
  v_added_roles   text[];
  v_prev_roles    text[];
  v_new_roles     text[];
  v_employee_id   uuid;
  v_prev_terminal text;
  v_new_terminal  text;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may change enabled_stages';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required (min 3 chars)';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR jsonb_array_length(p_enabled_stages) < 1 THEN
    RAISE EXCEPTION 'enabled_stages must be a non-empty JSON array';
  END IF;
  IF p_mode NOT IN ('safe','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_mode = 'supersede' AND length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'supersede mode requires a reason of at least 10 characters';
  END IF;

  SELECT overall_status, enabled_stages, employee_id
    INTO v_status, v_prev, v_employee_id
    FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;

  SELECT EXISTS(SELECT 1 FROM public.annual_review_responses WHERE instance_id = p_instance_id)
    INTO v_has_responses;

  IF p_mode = 'safe'
     AND v_status NOT IN ('not_started','pending_self')
     AND v_has_responses THEN
    RAISE EXCEPTION 'cannot change workflow after review has been actioned (use supersede mode)';
  END IF;

  v_prev_roles := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_prev, '[]'::jsonb)));
  v_new_roles  := ARRAY(SELECT jsonb_array_elements_text(p_enabled_stages));
  v_removed_roles := ARRAY(SELECT unnest(v_prev_roles) EXCEPT SELECT unnest(v_new_roles));
  v_added_roles   := ARRAY(SELECT unnest(v_new_roles)  EXCEPT SELECT unnest(v_prev_roles));

  IF p_mode = 'supersede' AND array_length(v_removed_roles,1) IS NOT NULL THEN
    FOR r_resp IN
      SELECT * FROM public.annual_review_responses
       WHERE instance_id = p_instance_id
         AND reviewer_role::text = ANY(v_removed_roles)
    LOOP
      -- notify removed reviewer via email before archiving
      PERFORM public._ar_enqueue_email(
        'annual_review.reviewer_removed', r_resp.reviewer_id,
        jsonb_build_object(
          'instance_id', p_instance_id,
          'role', r_resp.reviewer_role,
          'reason', p_reason
        )
      );
      PERFORM public.archive_annual_review_response(
        r_resp.id,
        'ADR-160: stage removed by admin — ' || COALESCE(p_reason,'')
      );
    END LOOP;
  END IF;

  v_new_status := public.annual_review_first_pending_status(p_enabled_stages);

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         management_id  = CASE WHEN p_enabled_stages ? 'management' THEN management_id ELSE NULL END,
         manager_id     = CASE WHEN p_enabled_stages ? 'manager'      THEN manager_id     ELSE NULL END,
         skip_id        = CASE WHEN p_enabled_stages ? 'skip_manager' THEN skip_id        ELSE NULL END,
         dept_head_id   = CASE WHEN p_enabled_stages ? 'dept_head'    THEN dept_head_id   ELSE NULL END,
         bu_head_id     = CASE WHEN p_enabled_stages ? 'bu_head'      THEN bu_head_id     ELSE NULL END,
         hr_id          = CASE WHEN p_enabled_stages ? 'hr'           THEN hr_id          ELSE NULL END,
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

  -- Employee notice: Self added/removed OR terminal stage changed
  v_prev_terminal := COALESCE(v_prev_roles[array_length(v_prev_roles,1)], '');
  v_new_terminal  := COALESCE(v_new_roles[array_length(v_new_roles,1)], '');
  IF ('self' = ANY(v_removed_roles))
     OR ('self' = ANY(v_added_roles))
     OR v_prev_terminal IS DISTINCT FROM v_new_terminal THEN
    PERFORM public._ar_enqueue_email(
      'annual_review.workflow_changed', v_employee_id,
      jsonb_build_object(
        'instance_id', p_instance_id,
        'prev_stages', v_prev,
        'new_stages', p_enabled_stages,
        'reason', p_reason
      )
    );
  END IF;

  INSERT INTO public.annual_review_access_audit(action, actor_id, target_id, metadata)
  VALUES (
    'workflow_edited_post_action', v_caller, p_instance_id,
    jsonb_build_object(
      'prev_stages', v_prev,
      'new_stages',  p_enabled_stages,
      'added',       to_jsonb(v_added_roles),
      'removed',     to_jsonb(v_removed_roles),
      'mode',        p_mode,
      'prior_status', v_status,
      'new_status',   v_new_status,
      'reason', p_reason
    )
  );
END; $$;

-- Extend reassign_annual_review_reviewer: min-10 reason on supersede + emails
CREATE OR REPLACE FUNCTION public.reassign_annual_review_reviewer(
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
  IF p_mode = 'supersede' AND length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'supersede mode requires a reason of at least 10 characters';
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
      -- notify old reviewer their locked response was archived
      PERFORM public._ar_enqueue_email(
        'annual_review.reviewer_removed', v_locked_resp.reviewer_id,
        jsonb_build_object(
          'instance_id', p_instance_id, 'role', p_role, 'reason', p_reason
        )
      );
      PERFORM public.archive_annual_review_response(
        v_locked_resp.id,
        'ADR-160: reviewer superseded — ' || COALESCE(p_reason,'')
      );
    END IF;

    v_target_status := ('pending_' || CASE p_role
      WHEN 'skip_manager' THEN 'skip'
      ELSE p_role END)::public.annual_review_status;
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
    INSERT INTO public.annual_review_access_audit(action, actor_id, target_id, metadata)
    VALUES (
      'reviewer_reassigned_supersede', auth.uid(), p_instance_id,
      jsonb_build_object(
        'role', p_role,
        'old_reviewer_id', v_old_reviewer,
        'new_reviewer_id', p_new_reviewer_id,
        'target_status', v_target_status,
        'reason', p_reason
      )
    );
  END IF;

  -- In-app notification for the new reviewer
  BEGIN
    INSERT INTO public.notifications(user_id, title, message, type, metadata)
    VALUES (
      p_new_reviewer_id,
      'Annual review assigned to you',
      'You have been assigned as ' || p_role || ' reviewer for an annual review.',
      'annual_review',
      jsonb_build_object('instance_id', p_instance_id, 'role', p_role, 'mode', p_mode)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Email new reviewer
  PERFORM public._ar_enqueue_email(
    'annual_review.reviewer_assigned', p_new_reviewer_id,
    jsonb_build_object('instance_id', p_instance_id, 'role', p_role, 'mode', p_mode)
  );

  RETURN v_override;
END; $$;

-- Orchestrator: single summary audit + min-10 reason on supersede
CREATE OR REPLACE FUNCTION public.annual_review_edit_workflow(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reviewer_overrides jsonb,
  p_mode text,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_stage_mode text;
  v_reviewer_mode text;
  v_reviewer_summary jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can edit workflow.';
  END IF;
  IF p_mode NOT IN ('safe','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_mode = 'supersede' AND (p_reason IS NULL OR length(trim(p_reason)) < 10) THEN
    RAISE EXCEPTION 'supersede mode requires a reason of at least 10 characters';
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

  -- Single orchestrator-level summary audit
  INSERT INTO public.annual_review_access_audit(action, actor_id, target_id, metadata)
  VALUES (
    'workflow_edited_post_action', auth.uid(), p_instance_id,
    jsonb_build_object(
      'summary', true,
      'mode', p_mode,
      'stages', p_enabled_stages,
      'reviewer_changes', v_reviewer_summary,
      'reason', p_reason
    )
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.annual_review_edit_workflow(uuid, jsonb, jsonb, text, text) TO authenticated;
