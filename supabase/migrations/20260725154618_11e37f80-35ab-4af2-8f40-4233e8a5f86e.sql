
DROP FUNCTION IF EXISTS public.admin_apply_system_scores_upgrade(uuid, jsonb, jsonb, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.admin_apply_system_scores_upgrade(
  p_instance_id uuid,
  p_system_scores jsonb,
  p_system_scores_raw jsonb,
  p_total_score numeric DEFAULT NULL,
  p_final_rating text DEFAULT NULL,
  p_reason text DEFAULT NULL
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
  v_blocked jsonb := '[]'::jsonb;
  v_next_total numeric;
  v_next_final text;
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
      IF p_system_scores_raw ? v_key THEN
        v_new_raw := jsonb_set(v_new_raw, ARRAY[v_key],
                     to_jsonb((p_system_scores_raw->>v_key)::numeric), true);
      END IF;
      v_applied := v_applied || jsonb_build_object(
        'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts
      );
    ELSIF v_new_pts = v_old_pts THEN
      NULL;
    ELSE
      v_blocked := v_blocked || jsonb_build_object(
        'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts,
        'reason', 'downgrade_blocked'
      );
    END IF;
  END LOOP;

  -- Total score: numeric, monotonic upgrade.
  v_next_total := v_inst.total_score;
  IF p_total_score IS NOT NULL AND
     (v_inst.total_score IS NULL OR p_total_score >= v_inst.total_score) THEN
    v_next_total := p_total_score;
  END IF;

  -- Final rating: TEXT label ('Good','Outstanding',…) — cannot be ordered.
  -- Only overwrite if caller explicitly supplies a different label.
  v_next_final := v_inst.final_rating;
  IF p_final_rating IS NOT NULL AND v_inst.final_rating IS DISTINCT FROM p_final_rating THEN
    v_next_final := p_final_rating;
  END IF;

  IF v_new_sys <> v_old_sys
     OR v_new_raw <> v_old_raw
     OR v_next_total IS DISTINCT FROM v_inst.total_score
     OR v_next_final IS DISTINCT FROM v_inst.final_rating THEN
    UPDATE public.annual_review_instances
       SET system_scores      = v_new_sys,
           system_scores_raw  = v_new_raw,
           total_score        = v_next_total,
           final_rating       = v_next_final,
           updated_at         = now()
     WHERE id = p_instance_id;

    INSERT INTO public.annual_review_access_audit
      (actor_id, target_user_id, action, before, after, reason)
    VALUES (
      v_actor,
      v_inst.employee_id,
      'system_scores.admin_override',
      jsonb_build_object(
        'instance_id', p_instance_id,
        'overall_status', v_inst.overall_status,
        'system_scores', v_old_sys,
        'system_scores_raw', v_old_raw,
        'total_score', v_inst.total_score,
        'final_rating', v_inst.final_rating
      ),
      jsonb_build_object(
        'system_scores', v_new_sys,
        'system_scores_raw', v_new_raw,
        'total_score', v_next_total,
        'final_rating', v_next_final,
        'applied', v_applied,
        'blocked', v_blocked
      ),
      p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'instance_id', p_instance_id,
    'applied', v_applied,
    'blocked', v_blocked,
    'total_score', v_next_total,
    'final_rating', v_next_final,
    'status', v_inst.overall_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_apply_system_scores_upgrade(uuid, jsonb, jsonb, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_system_scores_upgrade(uuid, jsonb, jsonb, numeric, text, text) TO authenticated, service_role;
