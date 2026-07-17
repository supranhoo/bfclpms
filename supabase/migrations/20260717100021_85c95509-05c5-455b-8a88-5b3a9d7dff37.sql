
DO $$
DECLARE
  v_cycle uuid := 'b82a935f-05a3-4a18-a65c-215d2ef16c4c'::uuid;
  r record;
BEGIN
  -- Iterate through every mismatch and apply
  FOR r IN
    WITH d AS (
      SELECT i.id AS instance_id, i.employee_id, i.cycle_id,
             i.overall_status::text AS overall_status, i.enabled_stages,
             s.slot,
             (i.enabled_stages ? (CASE s.slot WHEN 'skip' THEN 'skip_manager' ELSE s.slot END)) AS stage_enabled,
             exp.expected_user_id,
             CASE s.slot
               WHEN 'manager'   THEN i.manager_id
               WHEN 'skip'      THEN i.skip_id
               WHEN 'dept_head' THEN i.dept_head_id
               WHEN 'bu_head'   THEN i.bu_head_id
               WHEN 'hr'        THEN i.hr_id
             END AS actual
      FROM public.annual_review_instances i
      CROSS JOIN (VALUES ('manager'),('skip'),('dept_head'),('bu_head'),('hr')) s(slot)
      LEFT JOIN LATERAL public.ar_expected_reviewer_slots(i.id) exp ON exp.slot = s.slot
      WHERE i.cycle_id = v_cycle
        AND i.overall_status <> 'excluded'
    ),
    stage_gate AS (
      -- Only apply if the review hasn't advanced past that stage
      SELECT d.*,
        CASE d.slot
          WHEN 'manager'   THEN d.overall_status IN ('not_started','pending_self','pending_manager')
          WHEN 'skip'      THEN d.overall_status IN ('not_started','pending_self','pending_manager','pending_skip')
          WHEN 'dept_head' THEN d.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept')
          WHEN 'bu_head'   THEN d.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu')
          WHEN 'hr'        THEN d.overall_status <> 'completed'
        END AS still_open
      FROM d
    )
    SELECT * FROM stage_gate
    WHERE stage_enabled
      AND still_open
      AND expected_user_id IS NOT NULL
      AND (actual IS NULL OR actual IS DISTINCT FROM expected_user_id)
  LOOP
    IF    r.slot = 'manager'   THEN UPDATE public.annual_review_instances SET manager_id   = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
    ELSIF r.slot = 'skip'      THEN UPDATE public.annual_review_instances SET skip_id      = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
    ELSIF r.slot = 'dept_head' THEN UPDATE public.annual_review_instances SET dept_head_id = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
    ELSIF r.slot = 'bu_head'   THEN UPDATE public.annual_review_instances SET bu_head_id   = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
    ELSIF r.slot = 'hr'        THEN UPDATE public.annual_review_instances SET hr_id        = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
    END IF;

    INSERT INTO public.annual_review_reviewer_resync_audit(
      instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source, performed_by
    ) VALUES (
      r.instance_id, r.cycle_id, r.employee_id, r.slot, r.actual, r.expected_user_id,
      'resync_rpc', 'one_shot_reviewer_slot_backfill_2026_07_17', NULL
    );
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    'annual_review.reviewer_slot_resync_oneshot',
    NULL,
    jsonb_build_object(
      'cycle_id', v_cycle,
      'reason', 'CAPA: master-data driven reviewer slot backfill after 17-Jul ghost-slot null-out',
      'executed_at', now()
    )
  );
END $$;
