CREATE OR REPLACE FUNCTION public.reassign_annual_review_reviewer(p_instance_id uuid, p_role text, p_new_reviewer_id uuid, p_reason text)
 RETURNS annual_review_assignment_overrides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_override public.annual_review_assignment_overrides;
  v_instance public.annual_review_instances;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can reassign reviewers.';
  END IF;
  IF p_role NOT IN ('manager','skip_manager','dept_head','bu_head','hr') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
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

  IF p_role = 'manager' THEN
    UPDATE public.annual_review_instances SET manager_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'skip_manager' THEN
    UPDATE public.annual_review_instances SET skip_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'dept_head' THEN
    UPDATE public.annual_review_instances SET dept_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'bu_head' THEN
    UPDATE public.annual_review_instances SET bu_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'hr' THEN
    UPDATE public.annual_review_instances SET hr_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.reviewer_reassigned',
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id,
      'role', p_role,
      'new_reviewer_id', p_new_reviewer_id,
      'reason', p_reason
    )
  );

  RETURN v_override;
END;
$function$;