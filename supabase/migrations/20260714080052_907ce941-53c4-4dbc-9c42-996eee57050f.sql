
-- 1) Archive table
CREATE TABLE public.annual_review_reset_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  prior_template_id uuid,
  new_template_id uuid NOT NULL,
  prior_status public.annual_review_status NOT NULL,
  wiped_responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  wiped_proxy_submissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  reset_by uuid NOT NULL,
  reset_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_reset_archive TO authenticated;
GRANT ALL    ON public.annual_review_reset_archive TO service_role;

ALTER TABLE public.annual_review_reset_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_hr_read_reset_archive"
  ON public.annual_review_reset_archive
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  );

CREATE INDEX idx_reset_archive_instance ON public.annual_review_reset_archive(instance_id);
CREATE INDEX idx_reset_archive_cycle    ON public.annual_review_reset_archive(cycle_id);

-- 2) Single-instance force reset
CREATE OR REPLACE FUNCTION public.force_reset_annual_review_instance(
  p_instance_id uuid,
  p_new_template_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.annual_review_instances%ROWTYPE;
  v_wiped_responses jsonb;
  v_wiped_proxy jsonb;
  v_response_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'hr_pms'::public.app_role)
  ) THEN
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

  -- Snapshot
  SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb), COUNT(*)
    INTO v_wiped_responses, v_response_count
  FROM public.annual_review_responses r
  WHERE r.instance_id = p_instance_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
    INTO v_wiped_proxy
  FROM public.annual_review_proxy_submissions p
  WHERE p.instance_id = p_instance_id;

  INSERT INTO public.annual_review_reset_archive(
    instance_id, employee_id, cycle_id,
    prior_template_id, new_template_id, prior_status,
    wiped_responses, wiped_proxy_submissions, reason, reset_by
  ) VALUES (
    v_inst.id, v_inst.employee_id, v_inst.cycle_id,
    COALESCE(v_inst.template_override_id, v_inst.template_id),
    p_new_template_id, v_inst.overall_status,
    v_wiped_responses, v_wiped_proxy, btrim(p_reason), v_uid
  );

  -- Wipe live data
  DELETE FROM public.annual_review_responses         WHERE instance_id = p_instance_id;
  DELETE FROM public.annual_review_proxy_submissions WHERE instance_id = p_instance_id;

  -- Swap template & restart at pending_self
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
         updated_at             = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    'annual_review.instance_force_reset',
    v_uid,
    jsonb_build_object(
      'instance_id', v_inst.id,
      'employee_id', v_inst.employee_id,
      'cycle_id',    v_inst.cycle_id,
      'prior_template_id', COALESCE(v_inst.template_override_id, v_inst.template_id),
      'new_template_id',   p_new_template_id,
      'prior_status',      v_inst.overall_status,
      'wiped_response_count', v_response_count,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'instance_id', v_inst.id,
    'archived_response_count', v_response_count,
    'prior_status', v_inst.overall_status,
    'new_status', 'pending_self'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_reset_annual_review_instance(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_reset_annual_review_instance(uuid, uuid, text) TO authenticated;

-- 3) Bulk force reset
CREATE OR REPLACE FUNCTION public.bulk_force_reset_annual_review_instances(
  p_items jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_inst_id uuid;
  v_tpl_id uuid;
  v_ok int := 0;
  v_failed jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'hr_pms'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'only admin or hr_pms may force-reset annual review instances' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_inst_id := (v_item->>'instance_id')::uuid;
    v_tpl_id  := (v_item->>'new_template_id')::uuid;
    BEGIN
      v_res := public.force_reset_annual_review_instance(v_inst_id, v_tpl_id, p_reason);
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(v_res);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_array(jsonb_build_object(
        'instance_id', v_inst_id,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'failed', v_failed, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_force_reset_annual_review_instances(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_force_reset_annual_review_instances(jsonb, text) TO authenticated;
