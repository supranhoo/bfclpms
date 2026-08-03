CREATE OR REPLACE FUNCTION public.admin_apply_eligibility_inputs_correction(
  p_instance_id uuid,
  p_eligibility_inputs jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inst record;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_val text;
  v_applied jsonb := '[]'::jsonb;
  v_changed int := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (has_role(v_actor, 'admin'::app_role) OR has_role(v_actor, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'admin_or_hr_pms_required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'correction_reason_required';
  END IF;

  SELECT id, employee_id, overall_status, eligibility_inputs
    INTO v_inst
    FROM public.annual_review_instances
   WHERE id = p_instance_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance_not_found: %', p_instance_id; END IF;

  v_old := COALESCE(v_inst.eligibility_inputs, '{}'::jsonb);
  v_new := v_old;

  FOR v_key, v_val IN
    SELECT k, v FROM jsonb_each_text(COALESCE(p_eligibility_inputs, '{}'::jsonb)) AS t(k, v)
  LOOP
    IF (v_old ->> v_key) IS NOT DISTINCT FROM v_val THEN CONTINUE; END IF;
    v_new := jsonb_set(v_new, ARRAY[v_key], (p_eligibility_inputs -> v_key), true);
    v_changed := v_changed + 1;
    v_applied := v_applied || jsonb_build_object('key', v_key, 'old', v_old -> v_key, 'new', p_eligibility_inputs -> v_key);
  END LOOP;

  IF v_changed > 0 THEN
    UPDATE public.annual_review_instances
       SET eligibility_inputs = v_new, updated_at = now()
     WHERE id = p_instance_id;

    INSERT INTO public.annual_review_access_audit
      (actor_id, target_user_id, action, before, after, reason)
    VALUES (
      v_actor, v_inst.employee_id, 'admin_edit',
      jsonb_build_object('instance_id', p_instance_id, 'overall_status', v_inst.overall_status, 'eligibility_inputs', v_old),
      jsonb_build_object('instance_id', p_instance_id, 'overall_status', v_inst.overall_status, 'eligibility_inputs', v_new, 'applied', v_applied, 'changed_cells', v_changed, 'edit_scope', 'eligibility_inputs.admin_correction'),
      btrim(p_reason)
    );
  END IF;

  RETURN jsonb_build_object('applied', v_applied, 'changed_cells', v_changed);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_apply_eligibility_inputs_correction(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_eligibility_inputs_correction(uuid, jsonb, text) TO authenticated;