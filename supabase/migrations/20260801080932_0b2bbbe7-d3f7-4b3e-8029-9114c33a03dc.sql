DROP FUNCTION IF EXISTS public.admin_apply_system_scores_correction(uuid, jsonb, jsonb, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.admin_apply_system_scores_correction(
  p_instance_id uuid,
  p_system_scores jsonb,
  p_system_scores_raw jsonb,
  p_reason text,
  p_total_score numeric DEFAULT NULL::numeric,
  p_final_rating text DEFAULT NULL::text
)
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
  v_sum record;
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
                        WHEN v_new_pts < v_old_pts THEN 'down' ELSE 'same' END
    );
  END LOOP;

  IF v_new_sys IS DISTINCT FROM v_old_sys OR v_new_raw IS DISTINCT FROM v_old_raw THEN
    UPDATE public.annual_review_instances
       SET system_scores     = v_new_sys,
           system_scores_raw = v_new_raw,
           updated_at        = now()
     WHERE id = p_instance_id;
  END IF;

  -- Recompute headline score/rating from the corrected stored state unless the
  -- caller supplies explicit values (ADR-225a).
  IF p_total_score IS NOT NULL THEN
    v_next_total := p_total_score;
    v_next_final := COALESCE(p_final_rating, v_inst.final_rating);
  ELSE
    SELECT s.total_score, s.final_rating
      INTO v_sum
      FROM public.annual_review_compute_final_summary(p_instance_id) s;
    v_next_total := COALESCE(v_sum.total_score, v_inst.total_score);
    v_next_final := COALESCE(p_final_rating, v_sum.final_rating, v_inst.final_rating);
  END IF;

  IF v_next_total IS DISTINCT FROM v_inst.total_score
     OR v_next_final IS DISTINCT FROM v_inst.final_rating THEN
    UPDATE public.annual_review_instances
       SET total_score  = v_next_total,
           final_rating = v_next_final,
           updated_at   = now()
     WHERE id = p_instance_id;
  END IF;

  IF v_new_sys IS DISTINCT FROM v_old_sys
     OR v_new_raw IS DISTINCT FROM v_old_raw
     OR v_next_total IS DISTINCT FROM v_inst.total_score
     OR v_next_final IS DISTINCT FROM v_inst.final_rating THEN
    INSERT INTO public.annual_review_access_audit
      (actor_id, target_user_id, action, before, after, reason)
    VALUES (
      v_actor,
      v_inst.employee_id,
      'system_scores.admin_correction',
      jsonb_build_object(
        'instance_id', p_instance_id,
        'overall_status', v_inst.overall_status,
        'system_scores', v_old_sys,
        'system_scores_raw', v_old_raw,
        'total_score', v_inst.total_score,
        'final_rating', v_inst.final_rating
      ),
      jsonb_build_object(
        'instance_id', p_instance_id,
        'overall_status', v_inst.overall_status,
        'system_scores', v_new_sys,
        'system_scores_raw', v_new_raw,
        'total_score', v_next_total,
        'final_rating', v_next_final,
        'applied', v_applied,
        'upgraded_cells', v_up,
        'downgraded_cells', v_down,
        'recomputed', (p_total_score IS NULL)
      ),
      p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'upgraded_cells', v_up,
    'downgraded_cells', v_down,
    'total_score', v_next_total,
    'final_rating', v_next_final,
    'blocked', '[]'::jsonb
  );
END;
$function$;