
-- 1a. Department head columns
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS head_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS head_source text NOT NULL DEFAULT 'auto' CHECK (head_source IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS head_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_head_user_id ON public.departments(head_user_id);

-- 1b. Resolver: top of department reporting hierarchy, level-seniority tie-break
CREATE OR REPLACE FUNCTION public.resolve_department_head(p_dept_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_winner uuid;
BEGIN
  WITH scope AS (
    SELECT p.id, p.reporting_manager_id, p.doj, p.level_id
    FROM public.profiles p
    WHERE p.department_id = p_dept_id
      AND COALESCE(p.is_active, true) = true
      AND COALESCE(p.is_dummy_employee, false) = false
  ),
  roots AS (
    SELECT s.id, s.doj, s.level_id
    FROM scope s
    LEFT JOIN scope mgr ON mgr.id = s.reporting_manager_id
    WHERE s.reporting_manager_id IS NULL OR mgr.id IS NULL
  )
  SELECT r.id INTO v_winner
  FROM roots r
  LEFT JOIN public.levels lv ON lv.id = r.level_id
  ORDER BY
    CASE lv.name
      WHEN 'M0' THEN 0 WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 WHEN 'M3' THEN 3
      WHEN 'M4' THEN 4 WHEN 'M5' THEN 5 WHEN 'M6' THEN 6 WHEN 'M7' THEN 7
      WHEN 'W1' THEN 8 WHEN 'W2' THEN 9 WHEN 'W3' THEN 10 WHEN 'W4' THEN 11
      WHEN 'W5' THEN 12 ELSE 99 END ASC,
    r.doj ASC NULLS LAST,
    r.id ASC
  LIMIT 1;
  RETURN v_winner;
END $$;

-- 1c. Mutation RPCs
CREATE OR REPLACE FUNCTION public.set_department_head(p_dept_id uuid, p_user_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF coalesce(length(trim(p_reason)),0) < 3 THEN
    RAISE EXCEPTION 'Reason required (min 3 chars)';
  END IF;
  SELECT head_user_id INTO v_prev FROM public.departments WHERE id = p_dept_id;
  UPDATE public.departments
    SET head_user_id = p_user_id,
        head_source = 'manual',
        head_updated_at = now(),
        head_updated_by = auth.uid()
    WHERE id = p_dept_id;
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.dept_head_set', auth.uid(),
          jsonb_build_object('dept_id', p_dept_id, 'previous', v_prev, 'new', p_user_id, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_department_head(p_dept_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid; v_new uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT head_user_id INTO v_prev FROM public.departments WHERE id = p_dept_id;
  v_new := public.resolve_department_head(p_dept_id);
  UPDATE public.departments
    SET head_user_id = v_new,
        head_source = 'auto',
        head_updated_at = now(),
        head_updated_by = auth.uid()
    WHERE id = p_dept_id;
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.dept_head_recalculated', auth.uid(),
          jsonb_build_object('dept_id', p_dept_id, 'previous', v_prev, 'new', v_new));
  RETURN v_new;
END $$;

-- 1d. Snapshot on annual_review_instances
ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS dept_head_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
