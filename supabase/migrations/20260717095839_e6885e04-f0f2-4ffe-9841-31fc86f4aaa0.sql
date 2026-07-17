
-- =====================================================================
-- ADR-108 — Annual Review Reviewer Slot Resolution & Cascade
-- =====================================================================

-- 1) Audit table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_review_reviewer_resync_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id    uuid NOT NULL,
  cycle_id       uuid,
  employee_id    uuid,
  slot           text NOT NULL,   -- manager|skip|dept_head|bu_head|hr
  old_user_id    uuid,
  new_user_id    uuid,
  reason         text NOT NULL,   -- 'resync_rpc' | 'department_head_cascade' | 'bu_head_cascade' | 'hr_head_cascade'
  source         text,
  performed_by   uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_reviewer_resync_audit TO authenticated;
GRANT ALL    ON public.annual_review_reviewer_resync_audit TO service_role;

ALTER TABLE public.annual_review_reviewer_resync_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_hr_read_reviewer_resync_audit
  ON public.annual_review_reviewer_resync_audit;
CREATE POLICY admin_hr_read_reviewer_resync_audit
  ON public.annual_review_reviewer_resync_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE INDEX IF NOT EXISTS idx_ar_resync_audit_cycle_created
  ON public.annual_review_reviewer_resync_audit(cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_resync_audit_new_user
  ON public.annual_review_reviewer_resync_audit(new_user_id);

-- 2) Helper — resolve expected reviewer slots for an instance ---------
CREATE OR REPLACE FUNCTION public.ar_expected_reviewer_slots(p_instance_id uuid)
RETURNS TABLE (
  slot            text,
  expected_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp     uuid;
  v_dept    uuid;
  v_bu      uuid;
  v_company uuid;
  v_mgr     uuid;
BEGIN
  SELECT i.employee_id, p.department_id, p.business_unit_id, p.company_id, p.reporting_manager_id
    INTO v_emp, v_dept, v_bu, v_company, v_mgr
    FROM public.annual_review_instances i
    JOIN public.profiles p ON p.id = i.employee_id
   WHERE i.id = p_instance_id;

  IF v_emp IS NULL THEN
    RETURN;
  END IF;

  slot := 'manager';       expected_user_id := v_mgr;                                                      RETURN NEXT;
  slot := 'skip';          expected_user_id := (SELECT reporting_manager_id FROM public.profiles WHERE id = v_mgr); RETURN NEXT;
  slot := 'dept_head';     expected_user_id := (SELECT head_user_id FROM public.departments WHERE id = v_dept);      RETURN NEXT;
  slot := 'bu_head';       expected_user_id := (SELECT head_user_id FROM public.business_units WHERE id = v_bu);     RETURN NEXT;
  slot := 'hr';            expected_user_id := (SELECT hr_head_user_id FROM public.org_head_config WHERE company_id = v_company); RETURN NEXT;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.ar_expected_reviewer_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ar_expected_reviewer_slots(uuid) TO authenticated, service_role;

-- 3) Diagnostic RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_reviewer_slot_diagnostic(p_cycle_id uuid)
RETURNS TABLE (
  instance_id       uuid,
  employee_id       uuid,
  employee_code     text,
  employee_name     text,
  overall_status    text,
  enabled_stages    jsonb,
  slot              text,
  stage_enabled     boolean,
  stage_still_open  boolean,
  actual_user_id    uuid,
  expected_user_id  uuid,
  mismatch_kind     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may run the reviewer-slot diagnostic';
  END IF;

  RETURN QUERY
  WITH inst AS (
    SELECT i.id, i.employee_id, i.overall_status::text AS overall_status, i.enabled_stages,
           i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id,
           p.employee_code, p.full_name
      FROM public.annual_review_instances i
      JOIN public.profiles p ON p.id = i.employee_id
     WHERE i.cycle_id = p_cycle_id
       AND i.overall_status <> 'excluded'
  ),
  slotmap AS (
    SELECT * FROM (VALUES
      ('manager',    'manager',      'pending_manager'),
      ('skip',       'skip_manager', 'pending_skip'),
      ('dept_head',  'dept_head',    'pending_dept'),
      ('bu_head',    'bu_head',      'pending_bu'),
      ('hr',         'hr',           'pending_hr')
    ) AS t(slot, stage_key, pending_status)
  ),
  status_order AS (
    SELECT * FROM (VALUES
      ('pending_self',   0),
      ('pending_manager',1),
      ('pending_skip',   2),
      ('pending_dept',   3),
      ('pending_bu',     4),
      ('pending_hr',     5),
      ('completed',      6),
      ('not_started',   -1)
    ) AS t(st, ord)
  )
  SELECT
    i.id,
    i.employee_id,
    i.employee_code,
    i.full_name,
    i.overall_status,
    i.enabled_stages,
    s.slot,
    (i.enabled_stages ? s.stage_key)                 AS stage_enabled,
    (COALESCE((SELECT ord FROM status_order WHERE st = i.overall_status), 0)
      <= COALESCE((SELECT ord FROM status_order WHERE st = s.pending_status), 6)) AS stage_still_open,
    CASE s.slot
      WHEN 'manager'   THEN i.manager_id
      WHEN 'skip'      THEN i.skip_id
      WHEN 'dept_head' THEN i.dept_head_id
      WHEN 'bu_head'   THEN i.bu_head_id
      WHEN 'hr'        THEN i.hr_id
    END AS actual_user_id,
    exp.expected_user_id,
    CASE
      WHEN NOT (i.enabled_stages ? s.stage_key)
           AND (CASE s.slot
                  WHEN 'manager'   THEN i.manager_id
                  WHEN 'skip'      THEN i.skip_id
                  WHEN 'dept_head' THEN i.dept_head_id
                  WHEN 'bu_head'   THEN i.bu_head_id
                  WHEN 'hr'        THEN i.hr_id
                END) IS NOT NULL
        THEN 'stage_disabled_but_slot_set'
      WHEN (i.enabled_stages ? s.stage_key)
           AND (CASE s.slot
                  WHEN 'manager'   THEN i.manager_id
                  WHEN 'skip'      THEN i.skip_id
                  WHEN 'dept_head' THEN i.dept_head_id
                  WHEN 'bu_head'   THEN i.bu_head_id
                  WHEN 'hr'        THEN i.hr_id
                END) IS NULL
           AND exp.expected_user_id IS NOT NULL
        THEN 'missing_slot'
      WHEN (i.enabled_stages ? s.stage_key)
           AND exp.expected_user_id IS NOT NULL
           AND (CASE s.slot
                  WHEN 'manager'   THEN i.manager_id
                  WHEN 'skip'      THEN i.skip_id
                  WHEN 'dept_head' THEN i.dept_head_id
                  WHEN 'bu_head'   THEN i.bu_head_id
                  WHEN 'hr'        THEN i.hr_id
                END) IS DISTINCT FROM exp.expected_user_id
        THEN 'wrong_person'
      WHEN (i.enabled_stages ? s.stage_key)
           AND exp.expected_user_id IS NULL
           AND (CASE s.slot
                  WHEN 'manager'   THEN i.manager_id
                  WHEN 'skip'      THEN i.skip_id
                  WHEN 'dept_head' THEN i.dept_head_id
                  WHEN 'bu_head'   THEN i.bu_head_id
                  WHEN 'hr'        THEN i.hr_id
                END) IS NULL
        THEN 'orphan_head'
      ELSE 'ok'
    END AS mismatch_kind
  FROM inst i
  CROSS JOIN slotmap s
  LEFT JOIN LATERAL public.ar_expected_reviewer_slots(i.id) exp ON exp.slot = s.slot;
END $$;

REVOKE ALL ON FUNCTION public.annual_review_reviewer_slot_diagnostic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_reviewer_slot_diagnostic(uuid) TO authenticated, service_role;

-- 4) Resync RPC -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resync_annual_review_reviewer_slots(
  p_cycle_id uuid,
  p_dry_run  boolean DEFAULT true
)
RETURNS TABLE (
  instance_id  uuid,
  slot         text,
  old_user_id  uuid,
  new_user_id  uuid,
  applied      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  r        record;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may resync reviewer slots';
  END IF;

  FOR r IN
    SELECT * FROM public.annual_review_reviewer_slot_diagnostic(p_cycle_id) d
    WHERE d.stage_enabled
      AND d.stage_still_open
      AND d.mismatch_kind IN ('missing_slot','wrong_person')
      AND d.expected_user_id IS NOT NULL
  LOOP
    instance_id := r.instance_id;
    slot        := r.slot;
    old_user_id := r.actual_user_id;
    new_user_id := r.expected_user_id;
    applied     := NOT p_dry_run;

    IF NOT p_dry_run THEN
      -- Apply the fix on the correct column
      IF r.slot = 'manager' THEN
        UPDATE public.annual_review_instances SET manager_id  = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
      ELSIF r.slot = 'skip' THEN
        UPDATE public.annual_review_instances SET skip_id     = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
      ELSIF r.slot = 'dept_head' THEN
        UPDATE public.annual_review_instances SET dept_head_id= r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
      ELSIF r.slot = 'bu_head' THEN
        UPDATE public.annual_review_instances SET bu_head_id  = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
      ELSIF r.slot = 'hr' THEN
        UPDATE public.annual_review_instances SET hr_id       = r.expected_user_id, updated_at = now() WHERE id = r.instance_id;
      END IF;

      INSERT INTO public.annual_review_reviewer_resync_audit(
        instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source, performed_by
      )
      VALUES (
        r.instance_id, p_cycle_id, r.employee_id, r.slot, r.actual_user_id, r.expected_user_id,
        'resync_rpc', 'resync_annual_review_reviewer_slots', v_caller
      );
    END IF;

    RETURN NEXT;
  END LOOP;

  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.resync_annual_review_reviewer_slots(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resync_annual_review_reviewer_slots(uuid, boolean) TO authenticated, service_role;

-- 5) Cascade triggers -------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_departments_cascade_head_to_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    FOR r IN
      SELECT i.id AS instance_id, i.cycle_id, i.employee_id, i.dept_head_id AS old_id
        FROM public.annual_review_instances i
        JOIN public.profiles p ON p.id = i.employee_id
       WHERE p.department_id = NEW.id
         AND i.overall_status NOT IN ('completed','excluded','pending_bu','pending_hr')
         AND (i.enabled_stages ? 'dept_head')
    LOOP
      UPDATE public.annual_review_instances
         SET dept_head_id = NEW.head_user_id, updated_at = now()
       WHERE id = r.instance_id;

      INSERT INTO public.annual_review_reviewer_resync_audit(
        instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source
      ) VALUES (
        r.instance_id, r.cycle_id, r.employee_id, 'dept_head',
        r.old_id, NEW.head_user_id, 'department_head_cascade', 'departments.head_user_id'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS departments_cascade_head_to_ar ON public.departments;
CREATE TRIGGER departments_cascade_head_to_ar
  AFTER UPDATE OF head_user_id ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_departments_cascade_head_to_ar();

CREATE OR REPLACE FUNCTION public.tg_business_units_cascade_head_to_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    FOR r IN
      SELECT i.id AS instance_id, i.cycle_id, i.employee_id, i.bu_head_id AS old_id
        FROM public.annual_review_instances i
        JOIN public.profiles p ON p.id = i.employee_id
       WHERE p.business_unit_id = NEW.id
         AND i.overall_status NOT IN ('completed','excluded','pending_hr')
         AND (i.enabled_stages ? 'bu_head')
    LOOP
      UPDATE public.annual_review_instances
         SET bu_head_id = NEW.head_user_id, updated_at = now()
       WHERE id = r.instance_id;

      INSERT INTO public.annual_review_reviewer_resync_audit(
        instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source
      ) VALUES (
        r.instance_id, r.cycle_id, r.employee_id, 'bu_head',
        r.old_id, NEW.head_user_id, 'bu_head_cascade', 'business_units.head_user_id'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS business_units_cascade_head_to_ar ON public.business_units;
CREATE TRIGGER business_units_cascade_head_to_ar
  AFTER UPDATE OF head_user_id ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.tg_business_units_cascade_head_to_ar();

CREATE OR REPLACE FUNCTION public.tg_org_head_config_cascade_hr_to_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.hr_head_user_id IS DISTINCT FROM OLD.hr_head_user_id THEN
    FOR r IN
      SELECT i.id AS instance_id, i.cycle_id, i.employee_id, i.hr_id AS old_id
        FROM public.annual_review_instances i
        JOIN public.profiles p ON p.id = i.employee_id
       WHERE p.company_id = NEW.company_id
         AND i.overall_status NOT IN ('completed','excluded')
         AND (i.enabled_stages ? 'hr')
    LOOP
      UPDATE public.annual_review_instances
         SET hr_id = NEW.hr_head_user_id, updated_at = now()
       WHERE id = r.instance_id;

      INSERT INTO public.annual_review_reviewer_resync_audit(
        instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source
      ) VALUES (
        r.instance_id, r.cycle_id, r.employee_id, 'hr',
        r.old_id, NEW.hr_head_user_id, 'hr_head_cascade', 'org_head_config.hr_head_user_id'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS org_head_config_cascade_hr_to_ar ON public.org_head_config;
CREATE TRIGGER org_head_config_cascade_hr_to_ar
  AFTER UPDATE OF hr_head_user_id ON public.org_head_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_head_config_cascade_hr_to_ar();
