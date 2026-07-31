CREATE TABLE public.annual_review_system_score_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  employee_id uuid,
  slot_id text NOT NULL,
  slot_name text,
  overall_status text,
  old_raw numeric,
  new_raw numeric,
  old_points numeric,
  new_points numeric,
  old_total_score numeric,
  new_total_score numeric,
  old_final_rating text,
  new_final_rating text,
  reason text NOT NULL,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_system_score_edits TO authenticated;
GRANT ALL ON public.annual_review_system_score_edits TO service_role;

ALTER TABLE public.annual_review_system_score_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system score edits"
ON public.annual_review_system_score_edits
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ar_sys_score_edits_instance
  ON public.annual_review_system_score_edits (instance_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_update_system_scores_raw(
  p_instance_id uuid,
  p_system_scores jsonb,
  p_system_scores_raw jsonb,
  p_slot_names jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inst record;
  v_old_sys jsonb;
  v_old_raw jsonb;
  v_new_sys jsonb;
  v_new_raw jsonb;
  v_key text;
  v_pts numeric;
  v_raw numeric;
  v_applied jsonb := '[]'::jsonb;
  v_sum record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT id, employee_id, overall_status, system_scores, system_scores_raw,
         total_score, final_rating, criteria_weighted_score
    INTO v_inst
    FROM public.annual_review_instances
   WHERE id = p_instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instance_not_found: %', p_instance_id;
  END IF;

  v_old_sys := COALESCE(v_inst.system_scores, '{}'::jsonb);
  v_old_raw := COALESCE(v_inst.system_scores_raw, '{}'::jsonb);
  v_new_sys := v_old_sys;
  v_new_raw := v_old_raw;

  FOR v_key, v_pts IN
    SELECT k, NULLIF(v,'')::numeric FROM jsonb_each_text(COALESCE(p_system_scores, '{}'::jsonb)) AS t(k,v)
  LOOP
    v_raw := NULLIF(p_system_scores_raw->>v_key, '')::numeric;
    v_new_sys := jsonb_set(v_new_sys, ARRAY[v_key], to_jsonb(COALESCE(v_pts, 0)), true);
    IF v_raw IS NOT NULL THEN
      v_new_raw := jsonb_set(v_new_raw, ARRAY[v_key], to_jsonb(v_raw), true);
    END IF;
    v_applied := v_applied || jsonb_build_object(
      'key', v_key,
      'old_points', NULLIF(v_old_sys->>v_key,'')::numeric,
      'new_points', v_pts,
      'old_raw', NULLIF(v_old_raw->>v_key,'')::numeric,
      'new_raw', v_raw
    );
  END LOOP;

  IF v_new_sys = v_old_sys AND v_new_raw = v_old_raw THEN
    RETURN jsonb_build_object('instance_id', p_instance_id, 'applied', '[]'::jsonb,
                              'total_score', v_inst.total_score,
                              'final_rating', v_inst.final_rating,
                              'changed', false);
  END IF;

  UPDATE public.annual_review_instances
     SET system_scores     = v_new_sys,
         system_scores_raw = v_new_raw,
         updated_at        = now()
   WHERE id = p_instance_id;

  SELECT * INTO v_sum FROM public.annual_review_compute_final_summary(p_instance_id);

  IF v_sum.total_score IS NOT NULL THEN
    UPDATE public.annual_review_instances
       SET total_score  = v_sum.total_score,
           final_rating = COALESCE(v_sum.final_rating, final_rating),
           updated_at   = now()
     WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.annual_review_system_score_edits (
    instance_id, employee_id, slot_id, slot_name, overall_status,
    old_raw, new_raw, old_points, new_points,
    old_total_score, new_total_score, old_final_rating, new_final_rating,
    reason, edited_by
  )
  SELECT p_instance_id, v_inst.employee_id,
         a->>'key',
         NULLIF(p_slot_names->>(a->>'key'), ''),
         v_inst.overall_status::text,
         NULLIF(a->>'old_raw','')::numeric,
         NULLIF(a->>'new_raw','')::numeric,
         NULLIF(a->>'old_points','')::numeric,
         NULLIF(a->>'new_points','')::numeric,
         v_inst.total_score,
         COALESCE(v_sum.total_score, v_inst.total_score),
         v_inst.final_rating,
         COALESCE(v_sum.final_rating, v_inst.final_rating),
         btrim(p_reason),
         v_actor
    FROM jsonb_array_elements(v_applied) AS a;

  INSERT INTO public.annual_review_access_audit
    (actor_id, target_user_id, action, before, after, reason)
  VALUES (
    v_actor, v_inst.employee_id, 'system_scores.admin_edit',
    jsonb_build_object('instance_id', p_instance_id,
                       'overall_status', v_inst.overall_status,
                       'system_scores', v_old_sys,
                       'system_scores_raw', v_old_raw,
                       'total_score', v_inst.total_score,
                       'final_rating', v_inst.final_rating),
    jsonb_build_object('system_scores', v_new_sys,
                       'system_scores_raw', v_new_raw,
                       'total_score', COALESCE(v_sum.total_score, v_inst.total_score),
                       'final_rating', COALESCE(v_sum.final_rating, v_inst.final_rating),
                       'applied', v_applied),
    btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'instance_id', p_instance_id,
    'applied', v_applied,
    'total_score', COALESCE(v_sum.total_score, v_inst.total_score),
    'final_rating', COALESCE(v_sum.final_rating, v_inst.final_rating),
    'changed', true
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_system_scores_raw(uuid, jsonb, jsonb, jsonb, text) TO authenticated;