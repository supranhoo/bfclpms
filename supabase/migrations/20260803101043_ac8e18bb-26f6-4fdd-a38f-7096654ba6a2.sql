-- ADR-235 / POLICY §AR-FINAL-SCORE-SINGLE-WRITER
-- 1) admin_apply_system_scores_upgrade must not accept a client-supplied total.
CREATE OR REPLACE FUNCTION public.admin_apply_system_scores_upgrade(
  p_instance_id uuid, p_system_scores jsonb, p_system_scores_raw jsonb,
  p_total_score numeric DEFAULT NULL::numeric, p_final_rating text DEFAULT NULL::text,
  p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inst  record;
  v_old_sys jsonb;
  v_old_raw jsonb;
  v_new_sys jsonb;
  v_new_raw jsonb;
  v_key text;
  v_new_pts numeric;
  v_old_pts numeric;
  v_applied jsonb := '[]'::jsonb;
  v_blocked jsonb := '[]'::jsonb;
  v_next_total numeric;
  v_next_final text;
  v_apply text := 'not_run';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (has_role(v_actor, 'admin'::app_role) OR has_role(v_actor, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'admin_or_hr_pms_required';
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

  FOR v_key, v_new_pts IN
    SELECT k, (v)::numeric FROM jsonb_each_text(COALESCE(p_system_scores, '{}'::jsonb)) AS t(k,v)
  LOOP
    v_old_pts := NULLIF(v_old_sys->>v_key, '')::numeric;
    IF v_old_pts IS NULL OR v_new_pts > v_old_pts THEN
      v_new_sys := jsonb_set(v_new_sys, ARRAY[v_key], to_jsonb(v_new_pts), true);
      IF COALESCE(p_system_scores_raw, '{}'::jsonb) ? v_key THEN
        v_new_raw := jsonb_set(v_new_raw, ARRAY[v_key],
                     to_jsonb((p_system_scores_raw->>v_key)::numeric), true);
      END IF;
      v_applied := v_applied || jsonb_build_object(
        'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts);
    ELSIF v_new_pts = v_old_pts THEN
      NULL;
    ELSE
      v_blocked := v_blocked || jsonb_build_object(
        'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts,
        'reason', 'downgrade_blocked');
    END IF;
  END LOOP;

  IF v_new_sys IS DISTINCT FROM v_old_sys OR v_new_raw IS DISTINCT FROM v_old_raw THEN
    UPDATE public.annual_review_instances
       SET system_scores     = v_new_sys,
           system_scores_raw = v_new_raw,
           updated_at        = now()
     WHERE id = p_instance_id;
  END IF;

  -- ADR-235: the final score is ALWAYS re-derived by the sanctioned writer.
  -- p_total_score / p_final_rating are accepted for signature compatibility and ignored.
  v_apply := public.annual_review_apply_final_summary(
    p_instance_id, true, 'system_score_upgrade',
    COALESCE(NULLIF(btrim(p_reason), ''), 'system score upgrade'), v_actor);

  SELECT total_score, final_rating INTO v_next_total, v_next_final
    FROM public.annual_review_instances WHERE id = p_instance_id;

  IF v_new_sys IS DISTINCT FROM v_old_sys
     OR v_new_raw IS DISTINCT FROM v_old_raw
     OR v_next_total IS DISTINCT FROM v_inst.total_score
     OR v_next_final IS DISTINCT FROM v_inst.final_rating THEN
    INSERT INTO public.annual_review_access_audit
      (actor_id, target_user_id, action, before, after, reason)
    VALUES (
      v_actor, v_inst.employee_id, 'system_scores.admin_override',
      jsonb_build_object('instance_id', p_instance_id,
                         'overall_status', v_inst.overall_status,
                         'system_scores', v_old_sys,
                         'system_scores_raw', v_old_raw,
                         'total_score', v_inst.total_score,
                         'final_rating', v_inst.final_rating),
      jsonb_build_object('system_scores', v_new_sys,
                         'system_scores_raw', v_new_raw,
                         'total_score', v_next_total,
                         'final_rating', v_next_final,
                         'applied', v_applied,
                         'blocked', v_blocked,
                         'recompute', v_apply),
      p_reason);
  END IF;

  RETURN jsonb_build_object(
    'instance_id', p_instance_id,
    'applied', v_applied,
    'blocked', v_blocked,
    'total_score', v_next_total,
    'final_rating', v_next_final,
    'recompute', v_apply,
    'status', v_inst.overall_status);
END;
$function$;

-- 2) admin_apply_system_scores_correction: same single-writer rule.
CREATE OR REPLACE FUNCTION public.admin_apply_system_scores_correction(
  p_instance_id uuid, p_system_scores jsonb, p_system_scores_raw jsonb, p_reason text,
  p_total_score numeric DEFAULT NULL::numeric, p_final_rating text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_inst  record;
  v_old_sys jsonb;
  v_old_raw jsonb;
  v_new_sys jsonb;
  v_new_raw jsonb;
  v_key text;
  v_new_pts numeric;
  v_old_pts numeric;
  v_applied jsonb := '[]'::jsonb;
  v_up int := 0;
  v_down int := 0;
  v_next_total numeric;
  v_next_final text;
  v_apply text := 'not_run';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (has_role(v_actor, 'admin'::app_role) OR has_role(v_actor, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'admin_or_hr_pms_required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'correction_reason_required';
  END IF;

  SELECT id, employee_id, overall_status, system_scores, system_scores_raw,
         total_score, final_rating
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

  FOR v_key, v_new_pts IN
    SELECT k, (v)::numeric FROM jsonb_each_text(COALESCE(p_system_scores, '{}'::jsonb)) AS t(k,v)
  LOOP
    v_old_pts := NULLIF(v_old_sys->>v_key, '')::numeric;
    IF v_old_pts IS NOT NULL AND v_old_pts = v_new_pts
       AND (NOT (COALESCE(p_system_scores_raw, '{}'::jsonb) ? v_key)
            OR NULLIF(v_old_raw->>v_key,'')::numeric IS NOT DISTINCT FROM (p_system_scores_raw->>v_key)::numeric) THEN
      CONTINUE;
    END IF;
    v_new_sys := jsonb_set(v_new_sys, ARRAY[v_key], to_jsonb(v_new_pts), true);
    IF COALESCE(p_system_scores_raw, '{}'::jsonb) ? v_key THEN
      v_new_raw := jsonb_set(v_new_raw, ARRAY[v_key],
                   to_jsonb((p_system_scores_raw->>v_key)::numeric), true);
    END IF;
    IF v_old_pts IS NULL OR v_new_pts > v_old_pts THEN v_up := v_up + 1;
    ELSIF v_new_pts < v_old_pts THEN v_down := v_down + 1;
    END IF;
    v_applied := v_applied || jsonb_build_object(
      'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts,
      'direction', CASE WHEN v_old_pts IS NULL OR v_new_pts > v_old_pts THEN 'up'
                        WHEN v_new_pts < v_old_pts THEN 'down' ELSE 'same' END);
  END LOOP;

  IF v_new_sys IS DISTINCT FROM v_old_sys OR v_new_raw IS DISTINCT FROM v_old_raw THEN
    UPDATE public.annual_review_instances
       SET system_scores     = v_new_sys,
           system_scores_raw = v_new_raw,
           updated_at        = now()
     WHERE id = p_instance_id;
  END IF;

  -- ADR-235: always recompute through the sanctioned writer.
  v_apply := public.annual_review_apply_final_summary(
    p_instance_id, true, 'system_score_correction', btrim(p_reason), v_actor);

  SELECT total_score, final_rating INTO v_next_total, v_next_final
    FROM public.annual_review_instances WHERE id = p_instance_id;

  IF v_new_sys IS DISTINCT FROM v_old_sys
     OR v_new_raw IS DISTINCT FROM v_old_raw
     OR v_next_total IS DISTINCT FROM v_inst.total_score
     OR v_next_final IS DISTINCT FROM v_inst.final_rating THEN
    INSERT INTO public.annual_review_access_audit
      (actor_id, target_user_id, action, before, after, reason)
    VALUES (
      v_actor, v_inst.employee_id, 'system_scores.admin_correction',
      jsonb_build_object('instance_id', p_instance_id,
                         'overall_status', v_inst.overall_status,
                         'system_scores', v_old_sys,
                         'system_scores_raw', v_old_raw,
                         'total_score', v_inst.total_score,
                         'final_rating', v_inst.final_rating),
      jsonb_build_object('instance_id', p_instance_id,
                         'overall_status', v_inst.overall_status,
                         'system_scores', v_new_sys,
                         'system_scores_raw', v_new_raw,
                         'total_score', v_next_total,
                         'final_rating', v_next_final,
                         'applied', v_applied,
                         'upgraded_cells', v_up,
                         'downgraded_cells', v_down,
                         'recomputed', true,
                         'recompute', v_apply),
      p_reason);
  END IF;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'upgraded_cells', v_up,
    'downgraded_cells', v_down,
    'total_score', v_next_total,
    'final_rating', v_next_final,
    'recompute', v_apply,
    'blocked', '[]'::jsonb);
END;
$function$;

-- 3) Drift reader used by the admin monitor (ADR-235 D).
CREATE OR REPLACE FUNCTION public.annual_review_final_score_drift(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE(instance_id uuid, employee_code text, employee_name text,
              stored_total numeric, computed_total numeric,
              stored_rating text, computed_rating text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT i.id, p.employee_code, p.full_name,
         i.total_score, s.total_score, i.final_rating, s.final_rating
    FROM public.annual_review_instances i
    JOIN public.profiles p ON p.id = i.employee_id
    CROSS JOIN LATERAL public.annual_review_compute_final_summary(i.id) s
   WHERE i.overall_status = 'completed'
     AND i.excluded_at IS NULL
     AND (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
     AND (
       ROUND(COALESCE(i.total_score, -1), 2) <> ROUND(COALESCE(s.total_score, -1), 2)
       OR COALESCE(i.final_rating, '') <> COALESCE(s.final_rating, '')
     );
$function$;

REVOKE ALL ON FUNCTION public.annual_review_final_score_drift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.annual_review_final_score_drift(uuid) TO authenticated, service_role;

-- 4) Repair drifted instances (audited by annual_review_apply_final_summary).
DO $do$
DECLARE r record; BEGIN
  FOR r IN
    SELECT i.id
      FROM public.annual_review_instances i
      CROSS JOIN LATERAL public.annual_review_compute_final_summary(i.id) s
     WHERE i.overall_status = 'completed' AND i.excluded_at IS NULL
       AND (ROUND(COALESCE(i.total_score,-1),2) <> ROUND(COALESCE(s.total_score,-1),2)
            OR COALESCE(i.final_rating,'') <> COALESCE(s.final_rating,''))
  LOOP
    PERFORM public.annual_review_apply_final_summary(
      r.id, true, 'adr235_audit_repair',
      'ADR-235 audit: recompute after system-score upload wrote scores without recompute', NULL);
  END LOOP;
END $do$;

-- 5) Anomaly cleanup.
UPDATE public.annual_review_instances i
   SET finalized_at = COALESCE(
        (SELECT max(r.submitted_at) FROM public.annual_review_responses r WHERE r.instance_id = i.id),
        i.updated_at),
       updated_at = now()
 WHERE i.overall_status = 'completed' AND i.finalized_at IS NULL;

INSERT INTO public.annual_review_final_score_recompute_audit(
  instance_id, old_total_score, new_total_score, old_final_rating, new_final_rating,
  old_criteria_weighted_score, new_criteria_weighted_score, was_overwrite, source, reason, performed_by)
SELECT i.id, i.total_score, NULL, i.final_rating, NULL,
       i.criteria_weighted_score, i.criteria_weighted_score, true, 'adr235_anomaly_cleanup',
       'ADR-235: score cleared — instance is excluded or not completed', NULL
  FROM public.annual_review_instances i
 WHERE i.total_score IS NOT NULL
   AND (i.excluded_at IS NOT NULL OR i.overall_status <> 'completed');

UPDATE public.annual_review_instances
   SET total_score = NULL, final_rating = NULL, updated_at = now()
 WHERE total_score IS NOT NULL
   AND (excluded_at IS NOT NULL OR overall_status <> 'completed');

UPDATE public.annual_review_instances i
   SET criteria_weighted_score = (
         SELECT s.criteria_weighted_score
           FROM public.annual_review_compute_final_summary(i.id) s),
       updated_at = now()
 WHERE i.overall_status = 'completed' AND i.excluded_at IS NULL
   AND i.criteria_weighted_score IS NULL
   AND (SELECT s.criteria_weighted_score
          FROM public.annual_review_compute_final_summary(i.id) s) IS NOT NULL;