
-- ADR-148: Management stage backfill for historic annual review instances (jsonb-safe)

CREATE OR REPLACE FUNCTION public.get_management_seeding_gaps(p_management_uid uuid)
RETURNS TABLE (
  instance_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  overall_status text,
  enabled_stages jsonb,
  has_management_stage boolean,
  has_management_id boolean,
  bu_head_id uuid,
  needs_reopen boolean,
  cycle_id uuid,
  cycle_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ari.id AS instance_id,
    p.id  AS employee_id,
    p.employee_code,
    p.full_name AS employee_name,
    ari.overall_status::text,
    ari.enabled_stages,
    COALESCE(ari.enabled_stages ? 'management', false) AS has_management_stage,
    (ari.management_id IS NOT NULL) AS has_management_id,
    ari.bu_head_id,
    (ari.overall_status::text = 'completed') AS needs_reopen,
    ari.cycle_id,
    arc.name AS cycle_name
  FROM public.profiles p
  JOIN public.annual_review_instances ari ON ari.employee_id = p.id
  LEFT JOIN public.annual_review_cycles arc ON arc.id = ari.cycle_id
  WHERE p.reporting_manager_id = p_management_uid
    AND p.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_management_uid AND ur.role = 'management'
    )
    AND (
      ari.management_id IS NULL
      OR NOT COALESCE(ari.enabled_stages ? 'management', false)
    )
  ORDER BY p.employee_code;
$$;

REVOKE ALL ON FUNCTION public.get_management_seeding_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_management_seeding_gaps(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.backfill_management_stage_for_manager(
  p_management_uid uuid,
  p_reopen_completed boolean DEFAULT true,
  p_dry_run boolean DEFAULT false,
  p_reason text DEFAULT 'ADR-148 backfill'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_is_mgmt boolean;
  v_stamped int := 0;
  v_reopened int := 0;
  v_snapshot_count int := 0;
  r record;
  v_new_stages jsonb;
  v_new_status text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_actor AND role = 'admin')
    INTO v_is_admin;
  v_is_mgmt := (v_actor = p_management_uid);

  IF NOT (v_is_admin OR v_is_mgmt) THEN
    RAISE EXCEPTION 'not authorized to run management backfill';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_management_uid AND role = 'management'
  ) THEN
    RAISE EXCEPTION 'target user does not carry the management role';
  END IF;

  FOR r IN
    SELECT ari.*
    FROM public.profiles p
    JOIN public.annual_review_instances ari ON ari.employee_id = p.id
    WHERE p.reporting_manager_id = p_management_uid
      AND p.is_active = true
      AND (
        ari.management_id IS NULL
        OR NOT COALESCE(ari.enabled_stages ? 'management', false)
      )
  LOOP
    v_new_stages := COALESCE(r.enabled_stages, '[]'::jsonb);
    IF NOT (v_new_stages ? 'management') THEN
      v_new_stages := v_new_stages || '["management"]'::jsonb;
    END IF;

    v_new_status := r.overall_status::text;
    IF p_reopen_completed AND r.overall_status::text = 'completed' THEN
      v_new_status := 'pending_management';
    END IF;

    IF p_dry_run THEN
      v_stamped := v_stamped + 1;
      IF r.overall_status::text = 'completed' THEN v_reopened := v_reopened + 1; END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.annual_review_reset_archive(
      instance_id, employee_id, cycle_id, prior_template_id, new_template_id,
      prior_status, wiped_responses, wiped_proxy_submissions, reason, reset_by, reset_at
    ) VALUES (
      r.id, r.employee_id, r.cycle_id, r.template_id, r.template_id,
      r.overall_status,
      to_jsonb(r) - 'system_scores_raw' - 'system_scores',
      '[]'::jsonb,
      p_reason || ' (mgmt=' || p_management_uid::text || ')',
      v_actor, now()
    );
    v_snapshot_count := v_snapshot_count + 1;

    IF p_reopen_completed AND r.overall_status::text = 'completed' THEN
      UPDATE public.annual_review_instances
        SET management_id  = p_management_uid,
            enabled_stages = v_new_stages,
            overall_status = 'pending_management'::annual_review_status,
            total_score    = NULL,
            final_rating   = NULL,
            finalized_at   = NULL,
            finalized_by   = NULL,
            updated_at     = now()
      WHERE id = r.id;
      v_reopened := v_reopened + 1;
    ELSE
      UPDATE public.annual_review_instances
        SET management_id  = p_management_uid,
            enabled_stages = v_new_stages,
            updated_at     = now()
      WHERE id = r.id;
    END IF;
    v_stamped := v_stamped + 1;

    INSERT INTO public.annual_review_access_audit(
      actor_id, target_user_id, action, before, after, reason
    ) VALUES (
      v_actor, r.employee_id, 'management_stage.backfilled',
      jsonb_build_object(
        'instance_id', r.id,
        'overall_status', r.overall_status,
        'enabled_stages', r.enabled_stages,
        'management_id', r.management_id
      ),
      jsonb_build_object(
        'instance_id', r.id,
        'overall_status', v_new_status,
        'enabled_stages', v_new_stages,
        'management_id', p_management_uid,
        'reopened', (p_reopen_completed AND r.overall_status::text = 'completed')
      ),
      p_reason
    );
  END LOOP;

  RETURN jsonb_build_object(
    'management_uid', p_management_uid,
    'dry_run', p_dry_run,
    'reopen_completed', p_reopen_completed,
    'rows_stamped', v_stamped,
    'rows_reopened', v_reopened,
    'snapshots_written', v_snapshot_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_management_stage_for_manager(uuid, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_management_stage_for_manager(uuid, boolean, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_management_stage_for_manager(uuid, boolean, boolean, text)
IS 'ADR-148 — Backfills the management terminal stage on historic annual review instances for a given management user. Reopens completed rows into pending_management when p_reopen_completed=true. Snapshots to annual_review_reset_archive and logs to annual_review_access_audit.';
