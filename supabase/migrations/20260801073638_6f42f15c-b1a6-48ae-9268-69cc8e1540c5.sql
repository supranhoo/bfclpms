ALTER TABLE public.annual_review_access_audit
  DROP CONSTRAINT IF EXISTS annual_review_access_audit_action_check;
ALTER TABLE public.annual_review_access_audit
  ADD CONSTRAINT annual_review_access_audit_action_check
  CHECK (action = ANY (ARRAY[
    'kill_switch_toggled','override_upserted','override_deleted',
    'management_stage.backfilled','management_stage.backfilled_bulk',
    'management_stage.reverted','management_stage.reverted_after',
    'bu_terminal_restore','collapse_normalise',
    'workflow_edited_post_action','reviewer_reassigned_supersede',
    'system_scores.admin_override','admin_edit',
    'system_scores.admin_correction'
  ]));

-- ADR-225 / POLICY §AR-SYSTEM-SCORE-ADMIN-CORRECTION
-- Bi-directional (upgrade OR downgrade) admin correction of system score cells.
-- Additive: admin_apply_system_scores_upgrade is untouched.
CREATE OR REPLACE FUNCTION public.admin_apply_system_scores_correction(
  p_instance_id uuid,
  p_system_scores jsonb,
  p_system_scores_raw jsonb,
  p_reason text,
  p_total_score numeric DEFAULT NULL,
  p_final_rating numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_next_final numeric;
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
    IF v_old_pts IS NOT NULL AND v_old_pts = v_new_pts THEN
      CONTINUE;
    END IF;
    v_new_sys := jsonb_set(v_new_sys, ARRAY[v_key], to_jsonb(v_new_pts), true);
    IF p_system_scores_raw ? v_key THEN
      v_new_raw := jsonb_set(v_new_raw, ARRAY[v_key],
                   to_jsonb((p_system_scores_raw->>v_key)::numeric), true);
    END IF;
    IF v_old_pts IS NULL OR v_new_pts > v_old_pts THEN v_up := v_up + 1; ELSE v_down := v_down + 1; END IF;
    v_applied := v_applied || jsonb_build_object(
      'key', v_key, 'old_points', v_old_pts, 'new_points', v_new_pts,
      'direction', CASE WHEN v_old_pts IS NULL OR v_new_pts > v_old_pts THEN 'up' ELSE 'down' END
    );
  END LOOP;

  v_next_total := COALESCE(p_total_score, v_inst.total_score);
  v_next_final := COALESCE(p_final_rating, v_inst.final_rating);

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
        'downgraded_cells', v_down
      ),
      p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'upgraded_cells', v_up,
    'downgraded_cells', v_down,
    'blocked', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_system_scores_correction(uuid, jsonb, jsonb, text, numeric, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_apply_system_scores_correction(uuid, jsonb, jsonb, text, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.admin_apply_system_scores_correction IS
  'ADR-225: admin-only bi-directional system score correction (allows downgrades). Requires a reason; fully audit-logged; never changes overall_status.';