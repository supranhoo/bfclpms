-- ADR-243 / POLICY §AR-CRITERION-BACKFILL
CREATE TABLE IF NOT EXISTS public.annual_review_criteria_backfill_2026_08 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  response_id uuid NOT NULL,
  reviewer_role text NOT NULL,
  criterion_id text NOT NULL,
  criterion_name text,
  criterion_weight numeric,
  old_score numeric,
  new_score numeric NOT NULL,
  value_source text NOT NULL,
  old_weighted_score numeric,
  new_weighted_score numeric,
  old_total_score numeric,
  new_total_score numeric,
  old_final_rating text,
  new_final_rating text,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_criteria_backfill_2026_08 TO authenticated;
GRANT ALL ON public.annual_review_criteria_backfill_2026_08 TO service_role;

ALTER TABLE public.annual_review_criteria_backfill_2026_08 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read criteria backfill audit" ON public.annual_review_criteria_backfill_2026_08;
CREATE POLICY "Admins read criteria backfill audit"
  ON public.annual_review_criteria_backfill_2026_08
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ar_criteria_backfill_instance
  ON public.annual_review_criteria_backfill_2026_08 (instance_id);

-- Admin-only, reason-bound criterion backfill + final summary recompute.
CREATE OR REPLACE FUNCTION public.admin_backfill_annual_review_criteria(
  p_rows jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_inst uuid;
  v_role text;
  v_cid text;
  v_cname text;
  v_weight numeric;
  v_score numeric;
  v_source text;
  v_resp public.annual_review_responses%ROWTYPE;
  v_old_scores jsonb;
  v_new_scores jsonb;
  v_old_w numeric;
  v_new_w numeric;
  v_old_total numeric;
  v_old_rating text;
  v_new_total numeric;
  v_new_rating text;
  v_sum jsonb;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_instances uuid[] := ARRAY[]::uuid[];
  v_i uuid;
  v_res record;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a json array';
  END IF;

  PERFORM set_config('annual_review.bypass_stage_score_guard', 'on', true);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_inst   := (v_row->>'instance_id')::uuid;
    v_role   := v_row->>'reviewer_role';
    v_cid    := v_row->>'criterion_id';
    v_cname  := v_row->>'criterion_name';
    v_weight := NULLIF(v_row->>'weight','')::numeric;
    v_score  := NULLIF(v_row->>'score','')::numeric;
    v_source := COALESCE(NULLIF(v_row->>'source',''), 'sheet');

    IF v_score IS NULL OR v_score < 0 OR v_score > 5 THEN
      v_skipped := v_skipped || jsonb_build_object('instance_id', v_inst, 'criterion_id', v_cid, 'reason', 'invalid score');
      CONTINUE;
    END IF;

    SELECT * INTO v_resp
      FROM public.annual_review_responses
     WHERE instance_id = v_inst AND reviewer_role::text = v_role
     LIMIT 1;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('instance_id', v_inst, 'criterion_id', v_cid, 'reason', 'no response for stage');
      CONTINUE;
    END IF;

    v_old_scores := COALESCE(v_resp.criteria_scores, '{}'::jsonb);
    IF v_old_scores ? v_cid THEN
      v_skipped := v_skipped || jsonb_build_object('instance_id', v_inst, 'criterion_id', v_cid, 'reason', 'already scored');
      CONTINUE;
    END IF;

    SELECT i.total_score, i.final_rating INTO v_old_total, v_old_rating
      FROM public.annual_review_instances i WHERE i.id = v_inst;

    v_new_scores := v_old_scores || jsonb_build_object(v_cid, v_score);
    v_old_w := v_resp.weighted_score;

    SELECT COALESCE(SUM((c->>'weight')::numeric * (v_new_scores->>(c->>'id'))::numeric), 0)
      INTO v_new_w
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t
        ON t.id = COALESCE(i.template_override_id, i.template_id),
           LATERAL jsonb_array_elements(t.sections->'criteria') c
     WHERE i.id = v_inst AND v_new_scores ? (c->>'id');

    UPDATE public.annual_review_responses
       SET criteria_scores = v_new_scores,
           weighted_score  = v_new_w
     WHERE id = v_resp.id;

    INSERT INTO public.annual_review_criteria_backfill_2026_08 (
      instance_id, response_id, reviewer_role, criterion_id, criterion_name, criterion_weight,
      old_score, new_score, value_source, old_weighted_score, new_weighted_score,
      old_total_score, old_final_rating, reason, performed_by
    ) VALUES (
      v_inst, v_resp.id, v_role, v_cid, v_cname, v_weight,
      NULL, v_score, v_source, v_old_w, v_new_w,
      v_old_total, v_old_rating, btrim(p_reason), v_actor
    );

    v_applied := v_applied + 1;
    IF NOT (v_inst = ANY (v_instances)) THEN
      v_instances := array_append(v_instances, v_inst);
    END IF;
  END LOOP;

  -- Recompute final summary once per touched instance (single sanctioned writer).
  FOREACH v_i IN ARRAY v_instances LOOP
    SELECT * INTO v_res FROM public.annual_review_compute_final_summary(v_i);
    UPDATE public.annual_review_instances
       SET criteria_weighted_score = v_res.criteria_weighted_score,
           total_score  = v_res.total_score,
           final_rating = v_res.final_rating
     WHERE id = v_i;

    UPDATE public.annual_review_criteria_backfill_2026_08 b
       SET new_total_score = v_res.total_score,
           new_final_rating = v_res.final_rating
     WHERE b.instance_id = v_i AND b.new_total_score IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'instances', COALESCE(array_length(v_instances, 1), 0),
    'skipped', v_skipped
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_backfill_annual_review_criteria(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_backfill_annual_review_criteria(jsonb, text) TO authenticated, service_role;