CREATE OR REPLACE FUNCTION public.set_annual_review_stage_weights_override(
  p_instance_id UUID,
  p_weights JSONB,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_old JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason required (min 3 chars)' USING ERRCODE = '22023';
  END IF;

  SELECT public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'hr_pms'::app_role)
    INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'Only admin or HR PMS may set stage weight overrides' USING ERRCODE = '42501';
  END IF;

  IF p_weights IS NOT NULL AND NOT public.annual_review_validate_stage_weights(p_weights) THEN
    RAISE EXCEPTION 'Invalid stage_weights: must sum to 100 and use allowed keys' USING ERRCODE = '22023';
  END IF;

  SELECT stage_weights_override INTO v_old
    FROM public.annual_review_instances WHERE id = p_instance_id;

  UPDATE public.annual_review_instances
     SET stage_weights_override = p_weights,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(performed_by, action, metadata)
  VALUES (
    v_uid,
    'annual_review.stage_weights_override_set',
    jsonb_build_object(
      'instance_id', p_instance_id,
      'previous', v_old,
      'next', p_weights,
      'reason', p_reason
    )
  );
END;
$$;