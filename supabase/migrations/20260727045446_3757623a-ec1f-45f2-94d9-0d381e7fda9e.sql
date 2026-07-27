-- ADR-173 — Orphaned annual review reviewer succession

CREATE TABLE IF NOT EXISTS public.annual_review_orphan_repair_2026_07 (
  id bigserial PRIMARY KEY,
  instance_id uuid NOT NULL,
  employee_id uuid,
  stage text NOT NULL,
  orphan_reason text NOT NULL,
  old_reviewer_id uuid,
  new_reviewer_id uuid,
  old_status text,
  new_status text,
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_orphan_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_orphan_repair_2026_07 TO service_role;
ALTER TABLE public.annual_review_orphan_repair_2026_07 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orphan_repair_admin_read" ON public.annual_review_orphan_repair_2026_07;
CREATE POLICY "orphan_repair_admin_read"
  ON public.annual_review_orphan_repair_2026_07 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

-- ---------------------------------------------------------------------------
-- Detection SSOT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_orphaned_annual_reviews(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (
  instance_id uuid,
  cycle_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  overall_status text,
  stage text,
  is_current_stage boolean,
  reviewer_id uuid,
  reviewer_code text,
  reviewer_name text,
  orphan_reason text,
  suggested_reviewer_id uuid,
  suggested_reviewer_code text,
  suggested_reviewer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH guard AS (
    SELECT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) AS ok
  ),
  expanded AS (
    SELECT
      i.id, i.cycle_id, i.employee_id, i.overall_status::text AS st, s.stage,
      CASE s.stage
        WHEN 'manager'      THEN i.manager_id
        WHEN 'skip_manager' THEN i.skip_id
        WHEN 'dept_head'    THEN i.dept_head_id
        WHEN 'bu_head'      THEN i.bu_head_id
        WHEN 'hr'           THEN i.hr_id
        WHEN 'management'   THEN i.management_id
      END AS rid
    FROM public.annual_review_instances i
    CROSS JOIN LATERAL jsonb_array_elements_text(i.enabled_stages) s(stage)
    WHERE i.overall_status::text NOT IN ('completed', 'excluded')
      AND i.excluded_at IS NULL
      AND s.stage <> 'self'
      AND (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
  ),
  flagged AS (
    SELECT e.*, r.employee_code AS rc, r.full_name AS rn,
      CASE WHEN e.rid IS NULL THEN 'no_reviewer_mapped' ELSE 'inactive_reviewer' END AS reason
    FROM expanded e
    LEFT JOIN public.profiles r ON r.id = e.rid
    WHERE e.rid IS NULL OR r.is_active = false
  )
  SELECT
    f.id, f.cycle_id, f.employee_id, p.employee_code, p.full_name, f.st, f.stage,
    (f.st = CASE f.stage
        WHEN 'manager' THEN 'pending_manager'
        WHEN 'skip_manager' THEN 'pending_skip'
        WHEN 'dept_head' THEN 'pending_dept'
        WHEN 'bu_head' THEN 'pending_bu'
        WHEN 'hr' THEN 'pending_hr'
        WHEN 'management' THEN 'pending_management'
      END) AS is_current_stage,
    f.rid, f.rc, f.rn, f.reason,
    sug.id, sug.employee_code, sug.full_name
  FROM flagged f
  JOIN public.profiles p ON p.id = f.employee_id
  CROSS JOIN guard g
  LEFT JOIN LATERAL (
    SELECT sp.id, sp.employee_code, sp.full_name
    FROM public.profiles sp
    WHERE sp.is_active = true
      AND sp.id <> f.employee_id
      AND sp.id = CASE
        WHEN f.stage = 'bu_head' THEN (
          SELECT bu.head_user_id
          FROM public.profiles ep
          JOIN public.departments d2 ON d2.id = ep.department_id
          JOIN public.business_units bu ON bu.id = d2.business_unit_id
          WHERE ep.id = f.employee_id
        )
        WHEN f.stage = 'dept_head' THEN (
          SELECT d.head_user_id FROM public.departments d
          WHERE d.id = (SELECT ep.department_id FROM public.profiles ep WHERE ep.id = f.employee_id)
        )
        ELSE NULL
      END
    LIMIT 1
  ) sug ON true
  WHERE g.ok;
$$;

GRANT EXECUTE ON FUNCTION public.get_orphaned_annual_reviews(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bulk reassignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reassign_orphaned_reviewers(
  p_instance_ids uuid[],
  p_stage text,
  p_new_reviewer_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_old uuid;
  v_status text;
  v_emp uuid;
  v_ok int := 0;
  v_fail int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can repair orphaned reviews.';
  END IF;
  IF p_stage NOT IN ('manager','skip_manager','dept_head','bu_head','hr','management') THEN
    RAISE EXCEPTION 'Invalid stage: %', p_stage;
  END IF;
  IF p_new_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'A replacement reviewer must be selected.';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_new_reviewer_id AND is_active = true) THEN
    RAISE EXCEPTION 'Replacement reviewer must be an active user.';
  END IF;

  FOREACH v_id IN ARRAY p_instance_ids LOOP
    BEGIN
      SELECT employee_id, overall_status::text,
             CASE p_stage
               WHEN 'manager' THEN manager_id
               WHEN 'skip_manager' THEN skip_id
               WHEN 'dept_head' THEN dept_head_id
               WHEN 'bu_head' THEN bu_head_id
               WHEN 'hr' THEN hr_id
               WHEN 'management' THEN management_id
             END
        INTO v_emp, v_status, v_old
      FROM public.annual_review_instances WHERE id = v_id;

      IF v_emp IS NULL THEN
        RAISE EXCEPTION 'Instance not found';
      END IF;

      PERFORM public.reassign_annual_review_reviewer(v_id, p_stage, p_new_reviewer_id, p_reason, 'redirect');

      INSERT INTO public.annual_review_orphan_repair_2026_07
        (instance_id, employee_id, stage, orphan_reason, old_reviewer_id, new_reviewer_id, old_status, new_status, reason, performed_by)
      SELECT v_id, v_emp, p_stage,
             CASE WHEN v_old IS NULL THEN 'no_reviewer_mapped' ELSE 'inactive_reviewer' END,
             v_old, p_new_reviewer_id, v_status, i.overall_status::text, p_reason, auth.uid()
      FROM public.annual_review_instances i WHERE i.id = v_id;

      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('instance_id', v_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('succeeded', v_ok, 'failed', v_fail, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reassign_orphaned_reviewers(uuid[], text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Preventive guard: alert when an active reviewer / org head is deactivated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alert_on_reviewer_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending int;
  v_bus int;
  v_depts int;
BEGIN
  IF NEW.is_active = false AND COALESCE(OLD.is_active, true) = true THEN
    SELECT count(*) INTO v_pending
    FROM public.annual_review_instances i
    WHERE i.overall_status::text NOT IN ('completed','excluded')
      AND NEW.id IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id, i.management_id);

    SELECT count(*) INTO v_bus FROM public.business_units WHERE head_user_id = NEW.id;
    SELECT count(*) INTO v_depts FROM public.departments WHERE head_user_id = NEW.id;

    IF v_pending > 0 OR v_bus > 0 OR v_depts > 0 THEN
      INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
      VALUES (
        auth.uid(), NEW.id, 'reviewer_deactivated_orphan_risk',
        jsonb_build_object('is_active', true),
        jsonb_build_object('is_active', false, 'pending_instances', v_pending, 'business_units_headed', v_bus, 'departments_headed', v_depts),
        'Deactivated user still owns pending annual review stages or org-master head roles. Reassign via Admin > Orphaned Reviews.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_on_reviewer_deactivation ON public.profiles;
CREATE TRIGGER trg_alert_on_reviewer_deactivation
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_reviewer_deactivation();