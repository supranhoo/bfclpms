-- ============================================================
-- ADR-116 / POLICY §AR-SYSTEM-SCORES-KEY-STABILITY
-- Carry System Score values across a template swap by library_key
-- ============================================================

CREATE OR REPLACE FUNCTION public.remap_system_scores_by_library_key(
  p_old_template_id uuid,
  p_new_template_id uuid,
  p_old_system_scores jsonb,
  p_old_system_scores_raw jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_raw jsonb := '{}'::jsonb;
  v_new_scaled jsonb := '{}'::jsonb;
  v_carried_count int := 0;
  v_missing_keys text[] := ARRAY[]::text[];
  v_new_item jsonb;
  v_old_item jsonb;
  v_new_id text;
  v_new_key text;
  v_old_id text;
  v_raw_val jsonb;
  v_scaled_val jsonb;
BEGIN
  IF p_new_template_id IS NULL THEN
    RETURN jsonb_build_object(
      'system_scores', COALESCE(p_old_system_scores, '{}'::jsonb),
      'system_scores_raw', COALESCE(p_old_system_scores_raw, '{}'::jsonb),
      'carried', 0, 'missing_library_keys', ARRAY[]::text[]
    );
  END IF;

  FOR v_new_item IN
    SELECT s FROM public.annual_review_templates t,
      jsonb_array_elements(COALESCE(t.sections->'system_scores', '[]'::jsonb)) s
    WHERE t.id = p_new_template_id
  LOOP
    v_new_id  := v_new_item->>'id';
    v_new_key := NULLIF(v_new_item->>'library_key', '');

    -- carry_kra items compute live; nothing to persist.
    IF (v_new_item->>'source') = 'carry_kra' THEN
      CONTINUE;
    END IF;

    IF v_new_key IS NULL THEN
      -- no library_key on new item → nothing to match; flag it.
      v_missing_keys := array_append(v_missing_keys, v_new_id);
      CONTINUE;
    END IF;

    -- Find matching item on old template by library_key.
    SELECT s INTO v_old_item
    FROM public.annual_review_templates t,
      jsonb_array_elements(COALESCE(t.sections->'system_scores', '[]'::jsonb)) s
    WHERE t.id = p_old_template_id
      AND NULLIF(s->>'library_key','') = v_new_key
    LIMIT 1;

    IF v_old_item IS NULL THEN
      v_missing_keys := array_append(v_missing_keys, v_new_key);
      CONTINUE;
    END IF;

    v_old_id     := v_old_item->>'id';
    v_raw_val    := COALESCE(p_old_system_scores_raw, '{}'::jsonb) -> v_old_id;
    v_scaled_val := COALESCE(p_old_system_scores,     '{}'::jsonb) -> v_old_id;

    IF v_raw_val IS NOT NULL THEN
      v_new_raw := v_new_raw || jsonb_build_object(v_new_id, v_raw_val);
    END IF;
    IF v_scaled_val IS NOT NULL THEN
      v_new_scaled := v_new_scaled || jsonb_build_object(v_new_id, v_scaled_val);
    END IF;
    IF v_raw_val IS NOT NULL OR v_scaled_val IS NOT NULL THEN
      v_carried_count := v_carried_count + 1;
    ELSE
      v_missing_keys := array_append(v_missing_keys, v_new_key);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'system_scores',      v_new_scaled,
    'system_scores_raw',  v_new_raw,
    'carried',            v_carried_count,
    'missing_library_keys', v_missing_keys
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remap_system_scores_by_library_key(uuid,uuid,jsonb,jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.remap_system_scores_by_library_key IS
  'ADR-116: Returns rebuilt system_scores / system_scores_raw maps keyed for the new template by matching library_key. carry_kra items are omitted (computed live).';

-- ============================================================
-- Patch: force_reset_annual_review_instance now remaps system scores
-- ============================================================
CREATE OR REPLACE FUNCTION public.force_reset_annual_review_instance(
  p_instance_id uuid, p_new_template_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.annual_review_instances%ROWTYPE;
  v_wiped_responses jsonb;
  v_wiped_proxy jsonb;
  v_response_count int;
  v_old_template_id uuid;
  v_remap jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
       OR public.has_role(v_uid, 'hr_pms'::public.app_role)) THEN
    RAISE EXCEPTION 'only admin or hr_pms may force-reset an annual review instance' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;
  IF p_new_template_id IS NULL THEN
    RAISE EXCEPTION 'p_new_template_id is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.annual_review_templates WHERE id = p_new_template_id) THEN
    RAISE EXCEPTION 'template % does not exist', p_new_template_id USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instance % not found', p_instance_id USING ERRCODE = 'P0002';
  END IF;
  IF v_inst.overall_status IN ('completed'::public.annual_review_status, 'excluded'::public.annual_review_status)
     OR v_inst.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'instance is finalized/excluded and cannot be force-reset' USING ERRCODE = '22023';
  END IF;

  v_old_template_id := COALESCE(v_inst.template_override_id, v_inst.template_id);

  -- Snapshot responses/proxy for archive
  SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb), COUNT(*)
    INTO v_wiped_responses, v_response_count
  FROM public.annual_review_responses r WHERE r.instance_id = p_instance_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_wiped_proxy
  FROM public.annual_review_proxy_submissions p WHERE p.instance_id = p_instance_id;

  INSERT INTO public.annual_review_reset_archive(
    instance_id, employee_id, cycle_id,
    prior_template_id, new_template_id, prior_status,
    wiped_responses, wiped_proxy_submissions, reason, reset_by
  ) VALUES (
    v_inst.id, v_inst.employee_id, v_inst.cycle_id,
    v_old_template_id, p_new_template_id, v_inst.overall_status,
    v_wiped_responses, v_wiped_proxy, btrim(p_reason), v_uid
  );

  DELETE FROM public.annual_review_responses         WHERE instance_id = p_instance_id;
  DELETE FROM public.annual_review_proxy_submissions WHERE instance_id = p_instance_id;

  -- ADR-116: remap system scores across the template swap
  v_remap := public.remap_system_scores_by_library_key(
    v_old_template_id, p_new_template_id,
    v_inst.system_scores, v_inst.system_scores_raw
  );

  UPDATE public.annual_review_instances
     SET template_id            = p_new_template_id,
         template_override_id   = NULL,
         overall_status         = 'pending_self'::public.annual_review_status,
         submitted_via_proxy    = false,
         proxy_submission_id    = NULL,
         acknowledged_at        = NULL,
         acknowledged_by        = NULL,
         employee_rebuttal      = NULL,
         criteria_weighted_score= NULL,
         total_score            = NULL,
         final_rating           = NULL,
         system_scores          = COALESCE(v_remap->'system_scores', '{}'::jsonb),
         system_scores_raw      = COALESCE(v_remap->'system_scores_raw', '{}'::jsonb),
         updated_at             = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    'annual_review.instance_force_reset', v_uid,
    jsonb_build_object(
      'instance_id', v_inst.id, 'employee_id', v_inst.employee_id, 'cycle_id', v_inst.cycle_id,
      'prior_template_id', v_old_template_id, 'new_template_id', p_new_template_id,
      'prior_status', v_inst.overall_status, 'wiped_response_count', v_response_count,
      'reason', btrim(p_reason),
      'system_scores_remap', v_remap
    )
  );
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    'annual_review.system_scores_remapped', v_uid,
    jsonb_build_object(
      'instance_id', v_inst.id, 'employee_id', v_inst.employee_id,
      'source', 'force_reset',
      'carried', COALESCE((v_remap->>'carried')::int, 0),
      'missing_library_keys', v_remap->'missing_library_keys'
    )
  );

  RETURN jsonb_build_object(
    'instance_id', v_inst.id,
    'archived_response_count', v_response_count,
    'prior_status', v_inst.overall_status,
    'new_status', 'pending_self',
    'system_scores_remap', v_remap
  );
END;
$function$;
