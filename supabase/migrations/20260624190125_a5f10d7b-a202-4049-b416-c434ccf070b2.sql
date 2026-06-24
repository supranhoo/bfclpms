
-- ============================================================
-- HR Final auto-sync to current BU Head
-- ============================================================

-- 1) Preview function: returns instances whose hr_id differs from
--    the current HR BU Head for the employee's company.
CREATE OR REPLACE FUNCTION public.preview_hr_final_sync(p_cycle_id uuid)
RETURNS TABLE(
  instance_id uuid,
  employee_id uuid,
  current_hr_id uuid,
  target_hr_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can preview HR Final sync';
  END IF;

  RETURN QUERY
  WITH hr_bu_head AS (
    SELECT d.company_id, bu.head_user_id
    FROM public.business_units bu
    JOIN public.divisions d ON d.id = bu.division_id
    WHERE lower(bu.name) = 'hr'
      AND bu.head_user_id IS NOT NULL
  )
  SELECT
    ari.id,
    ari.employee_id,
    ari.hr_id,
    h.head_user_id
  FROM public.annual_review_instances ari
  JOIN public.profiles p ON p.id = ari.employee_id
  JOIN hr_bu_head h ON h.company_id = p.company_id
  WHERE ari.cycle_id = p_cycle_id
    AND ari.overall_status <> 'completed'
    AND ari.finalized_at IS NULL
    AND (ari.hr_id IS DISTINCT FROM h.head_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_assignment_overrides ov
      WHERE ov.instance_id = ari.id AND lower(ov.role) = 'hr'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_hr_final_sync(uuid) TO authenticated;

-- 2) Apply function: performs the update + audit log per row.
--    p_performed_by NULL = automated (trigger path). Manual path passes auth.uid().
CREATE OR REPLACE FUNCTION public.sync_hr_final_to_current_bu_head(
  p_cycle_id uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_actor uuid;
  r RECORD;
BEGIN
  -- Admin gate only for manual calls (when invoked from app/trigger we still
  -- want admin or system context).
  v_actor := COALESCE(p_performed_by, auth.uid());
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can sync HR Final assignments';
  END IF;

  FOR r IN
    WITH hr_bu_head AS (
      SELECT d.company_id, bu.head_user_id
      FROM public.business_units bu
      JOIN public.divisions d ON d.id = bu.division_id
      WHERE lower(bu.name) = 'hr'
        AND bu.head_user_id IS NOT NULL
    )
    SELECT
      ari.id AS instance_id,
      ari.hr_id AS old_hr_id,
      h.head_user_id AS new_hr_id,
      ari.employee_id,
      ari.cycle_id
    FROM public.annual_review_instances ari
    JOIN public.profiles p ON p.id = ari.employee_id
    JOIN hr_bu_head h ON h.company_id = p.company_id
    WHERE ari.cycle_id = p_cycle_id
      AND ari.overall_status <> 'completed'
      AND ari.finalized_at IS NULL
      AND (ari.hr_id IS DISTINCT FROM h.head_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.annual_review_assignment_overrides ov
        WHERE ov.instance_id = ari.id AND lower(ov.role) = 'hr'
      )
  LOOP
    UPDATE public.annual_review_instances
    SET hr_id = r.new_hr_id,
        updated_at = now()
    WHERE id = r.instance_id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES (
      'annual_review.hr_final_resync',
      p_performed_by,
      jsonb_build_object(
        'instance_id', r.instance_id,
        'employee_id', r.employee_id,
        'cycle_id', r.cycle_id,
        'old_hr_id', r.old_hr_id,
        'new_hr_id', r.new_hr_id,
        'source', CASE WHEN p_performed_by IS NULL THEN 'bu_head_change_trigger' ELSE 'admin_manual' END
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_hr_final_to_current_bu_head(uuid, uuid) TO authenticated;

-- 3) Trigger on business_units: when HR BU head changes and toggle is ON,
--    cascade to all active cycles' non-finalized instances.
CREATE OR REPLACE FUNCTION public.tg_bu_head_change_cascade_hr()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean := false;
  v_setting jsonb;
  v_cycle_id uuid;
BEGIN
  -- Only act when HR BU's head_user_id actually changed.
  IF lower(COALESCE(NEW.name, '')) <> 'hr' THEN
    RETURN NEW;
  END IF;
  IF NEW.head_user_id IS NOT DISTINCT FROM OLD.head_user_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_setting
  FROM public.annual_review_settings
  WHERE key = 'auto_reassign_hr_on_bu_head_change';

  v_enabled := v_setting::text IN ('true','"true"');

  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  -- Cascade to every active cycle (status='active').
  FOR v_cycle_id IN
    SELECT id FROM public.annual_review_cycles WHERE status = 'active'
  LOOP
    PERFORM public.sync_hr_final_to_current_bu_head(v_cycle_id, NULL);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bu_head_change_cascade_hr ON public.business_units;
CREATE TRIGGER trg_bu_head_change_cascade_hr
AFTER UPDATE OF head_user_id ON public.business_units
FOR EACH ROW
EXECUTE FUNCTION public.tg_bu_head_change_cascade_hr();
