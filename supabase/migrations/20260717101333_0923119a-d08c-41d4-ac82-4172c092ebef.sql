
-- =====================================================================
-- ADR-109 — Annual Review: BU Head is terminal (no dept_head routing)
-- =====================================================================

-- 1) Audit table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_review_bu_head_terminal_audit_2026_07 (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        uuid NOT NULL,
  cycle_id           uuid,
  employee_id        uuid,
  old_enabled_stages jsonb,
  new_enabled_stages jsonb,
  old_dept_head_id   uuid,
  old_overall_status text,
  new_overall_status text,
  reason             text NOT NULL,   -- 'bu_head_terminal_repair' | 'seed_bu_head' | 'bu_head_cascade'
  source             text,
  performed_by       uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_bu_head_terminal_audit_2026_07 TO authenticated;
GRANT ALL    ON public.annual_review_bu_head_terminal_audit_2026_07 TO service_role;

ALTER TABLE public.annual_review_bu_head_terminal_audit_2026_07 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_hr_read_bu_head_terminal_audit
  ON public.annual_review_bu_head_terminal_audit_2026_07;
CREATE POLICY admin_hr_read_bu_head_terminal_audit
  ON public.annual_review_bu_head_terminal_audit_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE INDEX IF NOT EXISTS idx_ar_buhead_terminal_audit_cycle
  ON public.annual_review_bu_head_terminal_audit_2026_07(cycle_id, created_at DESC);

-- 2) Helper — is user a BU head? --------------------------------------
CREATE OR REPLACE FUNCTION public.is_bu_head(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_units bu
     WHERE bu.head_user_id = p_user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_bu_head(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bu_head(uuid) TO authenticated, service_role;

-- 3) Diagnostic RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_bu_head_terminal_diagnostic(p_cycle_id uuid)
RETURNS TABLE (
  instance_id       uuid,
  employee_id       uuid,
  employee_code     text,
  employee_name     text,
  overall_status    text,
  enabled_stages    jsonb,
  bu_names          text,
  current_dept_head_id uuid,
  projected_status  text,
  projected_chain   jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may run the BU-head terminal diagnostic';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.employee_id,
    p.employee_code,
    p.full_name,
    i.overall_status::text,
    i.enabled_stages,
    (SELECT string_agg(bu.name, ', ' ORDER BY bu.name)
       FROM public.business_units bu
      WHERE bu.head_user_id = i.employee_id),
    i.dept_head_id,
    CASE
      WHEN i.overall_status::text = 'pending_dept' THEN
        CASE
          WHEN (i.enabled_stages ? 'bu_head') AND i.bu_head_id IS NOT NULL
               AND i.bu_head_id <> i.employee_id THEN 'pending_bu'
          WHEN (i.enabled_stages ? 'hr') AND i.hr_id IS NOT NULL
               AND i.hr_id <> i.employee_id THEN 'pending_hr'
          ELSE 'completed'
        END
      ELSE i.overall_status::text
    END,
    (SELECT jsonb_agg(s) FROM jsonb_array_elements_text(i.enabled_stages) s
      WHERE s.value <> 'dept_head')
  FROM public.annual_review_instances i
  JOIN public.profiles p ON p.id = i.employee_id
  WHERE i.cycle_id = p_cycle_id
    AND i.overall_status::text NOT IN ('completed','excluded')
    AND public.is_bu_head(i.employee_id)
    AND (i.enabled_stages ? 'dept_head');
END $$;
REVOKE ALL ON FUNCTION public.annual_review_bu_head_terminal_diagnostic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_bu_head_terminal_diagnostic(uuid) TO authenticated, service_role;

-- 4) Repair RPC -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_bu_head_terminal_chains(
  p_cycle_id uuid,
  p_dry_run  boolean DEFAULT true
)
RETURNS TABLE (
  instance_id        uuid,
  employee_id        uuid,
  old_enabled_stages jsonb,
  new_enabled_stages jsonb,
  old_overall_status text,
  new_overall_status text,
  applied            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  r        record;
  v_new_stages jsonb;
  v_new_status text;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may repair BU-head terminal chains';
  END IF;

  FOR r IN
    SELECT i.id, i.employee_id, i.cycle_id, i.overall_status::text AS overall_status,
           i.enabled_stages, i.dept_head_id, i.bu_head_id, i.hr_id
      FROM public.annual_review_instances i
     WHERE i.cycle_id = p_cycle_id
       AND i.overall_status::text NOT IN ('completed','excluded')
       AND public.is_bu_head(i.employee_id)
       AND (i.enabled_stages ? 'dept_head')
  LOOP
    -- Compute new enabled_stages minus 'dept_head'
    SELECT COALESCE(jsonb_agg(s ORDER BY ord), '[]'::jsonb)
      INTO v_new_stages
      FROM (
        SELECT value AS s,
               CASE value
                 WHEN 'self' THEN 0 WHEN 'manager' THEN 1 WHEN 'skip_manager' THEN 2
                 WHEN 'dept_head' THEN 3 WHEN 'bu_head' THEN 4 WHEN 'hr' THEN 5
                 ELSE 9 END AS ord
          FROM jsonb_array_elements_text(r.enabled_stages)
         WHERE value <> 'dept_head'
      ) t;

    -- If currently blocked at pending_dept, advance to next available stage.
    v_new_status := r.overall_status;
    IF r.overall_status = 'pending_dept' THEN
      IF (v_new_stages ? 'bu_head') AND r.bu_head_id IS NOT NULL AND r.bu_head_id <> r.employee_id THEN
        v_new_status := 'pending_bu';
      ELSIF (v_new_stages ? 'hr') AND r.hr_id IS NOT NULL AND r.hr_id <> r.employee_id THEN
        v_new_status := 'pending_hr';
      ELSE
        v_new_status := 'completed';
      END IF;
    END IF;

    instance_id        := r.id;
    employee_id        := r.employee_id;
    old_enabled_stages := r.enabled_stages;
    new_enabled_stages := v_new_stages;
    old_overall_status := r.overall_status;
    new_overall_status := v_new_status;
    applied            := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.annual_review_instances
         SET enabled_stages = v_new_stages,
             dept_head_id   = NULL,
             overall_status = v_new_status::annual_review_status,
             updated_at     = now()
       WHERE id = r.id;

      INSERT INTO public.annual_review_bu_head_terminal_audit_2026_07(
        instance_id, cycle_id, employee_id,
        old_enabled_stages, new_enabled_stages,
        old_dept_head_id, old_overall_status, new_overall_status,
        reason, source, performed_by
      ) VALUES (
        r.id, r.cycle_id, r.employee_id,
        r.enabled_stages, v_new_stages,
        r.dept_head_id, r.overall_status, v_new_status,
        'bu_head_terminal_repair', 'repair_bu_head_terminal_chains', v_caller
      );
    END IF;

    RETURN NEXT;
  END LOOP;

  RETURN;
END $$;
REVOKE ALL ON FUNCTION public.repair_bu_head_terminal_chains(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_bu_head_terminal_chains(uuid, boolean) TO authenticated, service_role;

-- 5) Guard existing dept cascade — skip BU-head employees --------------
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
         AND NOT public.is_bu_head(i.employee_id)   -- §AR-BU-HEAD-TERMINAL
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

-- 6) BU-head cascade — strip dept_head for the new BU head's own instance
CREATE OR REPLACE FUNCTION public.tg_business_units_apply_terminal_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_new_stages jsonb;
  v_new_status text;
BEGIN
  IF NEW.head_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.head_user_id IS NOT DISTINCT FROM OLD.head_user_id THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT i.id, i.cycle_id, i.employee_id, i.overall_status::text AS overall_status,
           i.enabled_stages, i.dept_head_id, i.bu_head_id, i.hr_id
      FROM public.annual_review_instances i
     WHERE i.employee_id = NEW.head_user_id
       AND i.overall_status::text NOT IN ('completed','excluded')
       AND (i.enabled_stages ? 'dept_head')
  LOOP
    SELECT COALESCE(jsonb_agg(s ORDER BY ord), '[]'::jsonb)
      INTO v_new_stages
      FROM (
        SELECT value AS s,
               CASE value
                 WHEN 'self' THEN 0 WHEN 'manager' THEN 1 WHEN 'skip_manager' THEN 2
                 WHEN 'dept_head' THEN 3 WHEN 'bu_head' THEN 4 WHEN 'hr' THEN 5
                 ELSE 9 END AS ord
          FROM jsonb_array_elements_text(r.enabled_stages)
         WHERE value <> 'dept_head'
      ) t;

    v_new_status := r.overall_status;
    IF r.overall_status = 'pending_dept' THEN
      IF (v_new_stages ? 'bu_head') AND r.bu_head_id IS NOT NULL AND r.bu_head_id <> r.employee_id THEN
        v_new_status := 'pending_bu';
      ELSIF (v_new_stages ? 'hr') AND r.hr_id IS NOT NULL AND r.hr_id <> r.employee_id THEN
        v_new_status := 'pending_hr';
      ELSE
        v_new_status := 'completed';
      END IF;
    END IF;

    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_stages,
           dept_head_id   = NULL,
           overall_status = v_new_status::annual_review_status,
           updated_at     = now()
     WHERE id = r.id;

    INSERT INTO public.annual_review_bu_head_terminal_audit_2026_07(
      instance_id, cycle_id, employee_id,
      old_enabled_stages, new_enabled_stages,
      old_dept_head_id, old_overall_status, new_overall_status,
      reason, source
    ) VALUES (
      r.id, r.cycle_id, r.employee_id,
      r.enabled_stages, v_new_stages,
      r.dept_head_id, r.overall_status, v_new_status,
      'bu_head_cascade', 'business_units.head_user_id'
    );
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS business_units_apply_terminal_rule ON public.business_units;
CREATE TRIGGER business_units_apply_terminal_rule
  AFTER INSERT OR UPDATE OF head_user_id ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.tg_business_units_apply_terminal_rule();

-- 7) One-shot repair for the active cycle -----------------------------
DO $$
DECLARE
  v_cycle uuid;
  r record;
  v_new_stages jsonb;
  v_new_status text;
BEGIN
  SELECT id INTO v_cycle
    FROM public.annual_review_cycles
   WHERE status = 'active'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_cycle IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT i.id, i.employee_id, i.cycle_id, i.overall_status::text AS overall_status,
           i.enabled_stages, i.dept_head_id, i.bu_head_id, i.hr_id
      FROM public.annual_review_instances i
     WHERE i.cycle_id = v_cycle
       AND i.overall_status::text NOT IN ('completed','excluded')
       AND public.is_bu_head(i.employee_id)
       AND (i.enabled_stages ? 'dept_head')
  LOOP
    SELECT COALESCE(jsonb_agg(s ORDER BY ord), '[]'::jsonb)
      INTO v_new_stages
      FROM (
        SELECT value AS s,
               CASE value
                 WHEN 'self' THEN 0 WHEN 'manager' THEN 1 WHEN 'skip_manager' THEN 2
                 WHEN 'dept_head' THEN 3 WHEN 'bu_head' THEN 4 WHEN 'hr' THEN 5
                 ELSE 9 END AS ord
          FROM jsonb_array_elements_text(r.enabled_stages)
         WHERE value <> 'dept_head'
      ) t;

    v_new_status := r.overall_status;
    IF r.overall_status = 'pending_dept' THEN
      IF (v_new_stages ? 'bu_head') AND r.bu_head_id IS NOT NULL AND r.bu_head_id <> r.employee_id THEN
        v_new_status := 'pending_bu';
      ELSIF (v_new_stages ? 'hr') AND r.hr_id IS NOT NULL AND r.hr_id <> r.employee_id THEN
        v_new_status := 'pending_hr';
      ELSE
        v_new_status := 'completed';
      END IF;
    END IF;

    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_stages,
           dept_head_id   = NULL,
           overall_status = v_new_status::annual_review_status,
           updated_at     = now()
     WHERE id = r.id;

    INSERT INTO public.annual_review_bu_head_terminal_audit_2026_07(
      instance_id, cycle_id, employee_id,
      old_enabled_stages, new_enabled_stages,
      old_dept_head_id, old_overall_status, new_overall_status,
      reason, source
    ) VALUES (
      r.id, r.cycle_id, r.employee_id,
      r.enabled_stages, v_new_stages,
      r.dept_head_id, r.overall_status, v_new_status,
      'bu_head_terminal_repair', 'migration:one_shot'
    );
  END LOOP;
END $$;
