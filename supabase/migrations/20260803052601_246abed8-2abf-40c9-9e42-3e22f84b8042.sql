-- ADR-232: Annual Review final-score write-back integrity

CREATE TABLE IF NOT EXISTS public.annual_review_final_score_recompute_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  old_total_score numeric,
  new_total_score numeric,
  old_final_rating text,
  new_final_rating text,
  old_criteria_weighted_score numeric,
  new_criteria_weighted_score numeric,
  was_overwrite boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_final_score_recompute_audit TO authenticated;
GRANT ALL ON public.annual_review_final_score_recompute_audit TO service_role;

ALTER TABLE public.annual_review_final_score_recompute_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_fs_recompute_audit_read ON public.annual_review_final_score_recompute_audit;
CREATE POLICY ar_fs_recompute_audit_read
  ON public.annual_review_final_score_recompute_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'hr_pms'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_ar_fs_recompute_audit_instance
  ON public.annual_review_final_score_recompute_audit(instance_id, created_at DESC);

-- Shared write-back helper (SSOT: annual_review_compute_final_summary)
CREATE OR REPLACE FUNCTION public.annual_review_apply_final_summary(
  p_instance_id uuid,
  p_allow_overwrite boolean DEFAULT false,
  p_source text DEFAULT 'manual',
  p_reason text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_sum  record;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_inst.overall_status = 'excluded' THEN RETURN 'skipped_excluded'; END IF;

  IF v_inst.total_score IS NOT NULL AND NOT p_allow_overwrite THEN
    RETURN 'skipped_has_score';
  END IF;

  SELECT * INTO v_sum FROM public.annual_review_compute_final_summary(p_instance_id);

  IF v_sum.total_score IS NULL THEN RETURN 'skipped_not_computable'; END IF;

  -- Never manufacture a 0 for an instance that has no score source at all
  IF v_inst.total_score IS NULL
     AND COALESCE(v_sum.total_score,0) = 0
     AND COALESCE(v_sum.criteria_weighted_score,0) = 0 THEN
    RETURN 'skipped_no_score_source';
  END IF;

  IF v_inst.total_score IS NOT NULL
     AND ROUND(v_inst.total_score,4) = ROUND(v_sum.total_score,4)
     AND v_inst.final_rating IS NOT NULL THEN
    RETURN 'unchanged';
  END IF;

  INSERT INTO public.annual_review_final_score_recompute_audit(
    instance_id, old_total_score, new_total_score,
    old_final_rating, new_final_rating,
    old_criteria_weighted_score, new_criteria_weighted_score,
    was_overwrite, source, reason, performed_by
  ) VALUES (
    p_instance_id, v_inst.total_score, v_sum.total_score,
    v_inst.final_rating, v_sum.final_rating,
    v_inst.criteria_weighted_score, v_sum.criteria_weighted_score,
    (v_inst.total_score IS NOT NULL), COALESCE(p_source,'manual'), p_reason,
    COALESCE(p_actor, auth.uid())
  );

  UPDATE public.annual_review_instances
     SET total_score             = v_sum.total_score,
         final_rating            = COALESCE(v_sum.final_rating, final_rating),
         criteria_weighted_score = COALESCE(v_sum.criteria_weighted_score, criteria_weighted_score),
         updated_at              = now()
   WHERE id = p_instance_id;

  RETURN 'applied';
END $function$;

REVOKE ALL ON FUNCTION public.annual_review_apply_final_summary(uuid, boolean, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_apply_final_summary(uuid, boolean, text, text, uuid) TO service_role;

-- Admin-facing batch RPC
CREATE OR REPLACE FUNCTION public.admin_recompute_annual_review_final_score(
  p_instance_ids uuid[],
  p_reason text,
  p_allow_overwrite boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_res text;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(v_actor,'admin'::public.app_role) OR public.has_role(v_actor,'hr_pms'::public.app_role)) THEN
    RAISE EXCEPTION 'only admin / hr_pms may recompute annual review final scores' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  IF p_instance_ids IS NULL OR array_length(p_instance_ids,1) IS NULL THEN
    RETURN jsonb_build_object('applied',0,'skipped','[]'::jsonb);
  END IF;

  IF array_length(p_instance_ids,1) > 1000 THEN
    RAISE EXCEPTION 'too many instances in one call (max 1000)' USING ERRCODE = '22023';
  END IF;

  IF p_allow_overwrite AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'only admin may overwrite an existing final score' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY p_instance_ids LOOP
    v_res := public.annual_review_apply_final_summary(
      v_id, p_allow_overwrite, 'admin_recompute', btrim(p_reason), v_actor
    );
    IF v_res = 'applied' THEN
      v_applied := v_applied + 1;
    ELSE
      v_skipped := v_skipped || jsonb_build_object('instance_id', v_id, 'reason', v_res);
    END IF;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.final_score_recompute', v_actor, jsonb_build_object(
    'applied', v_applied, 'skipped', v_skipped, 'overwrite', p_allow_overwrite, 'reason', btrim(p_reason)
  ));

  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
END $function$;

REVOKE ALL ON FUNCTION public.admin_recompute_annual_review_final_score(uuid[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recompute_annual_review_final_score(uuid[], text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recompute_annual_review_final_score(uuid[], text, boolean) TO service_role;

-- Self-healing: never leave a completed instance without a final score
CREATE OR REPLACE FUNCTION public.trg_ar_backfill_final_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_needs boolean := false;
BEGIN
  IF NEW.overall_status = 'completed'
     AND NEW.total_score IS NULL
     AND (TG_OP = 'INSERT' OR OLD.overall_status IS DISTINCT FROM 'completed' OR OLD.total_score IS NOT NULL) THEN
    v_needs := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.overall_status = 'completed'
     AND NEW.system_scores IS DISTINCT FROM OLD.system_scores THEN
    v_needs := true;
  END IF;

  IF v_needs THEN
    PERFORM public.annual_review_apply_final_summary(
      NEW.id, true, 'auto_backfill', 'automatic write-back on completion / system score change', NULL
    );
  END IF;

  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_ar_backfill_final_score ON public.annual_review_instances;
CREATE TRIGGER trg_ar_backfill_final_score
AFTER INSERT OR UPDATE OF overall_status, system_scores ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.trg_ar_backfill_final_score();