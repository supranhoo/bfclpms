
-- 1. Add head columns to business_units
ALTER TABLE public.business_units
  ADD COLUMN IF NOT EXISTS head_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS head_source text NOT NULL DEFAULT 'auto' CHECK (head_source IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS head_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS head_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_head_user_id ON public.business_units(head_user_id);

-- 2. Org head config (per-company, single row per company; covers HR head)
CREATE TABLE IF NOT EXISTS public.org_head_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  hr_business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  hr_head_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hr_head_source text NOT NULL DEFAULT 'auto' CHECK (hr_head_source IN ('auto','manual')),
  hr_head_updated_at timestamptz,
  hr_head_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

GRANT SELECT ON public.org_head_config TO authenticated;
GRANT ALL ON public.org_head_config TO service_role;

ALTER TABLE public.org_head_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_head_config readable by authenticated"
  ON public.org_head_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_head_config writeable by admin/hr_pms"
  ON public.org_head_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_org_head_config_updated_at
  BEFORE UPDATE ON public.org_head_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Resolver: top of scope (employee with no manager inside the scope, or manager points outside)
CREATE OR REPLACE FUNCTION public.resolve_bu_head(p_bu_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_winner uuid;
BEGIN
  WITH scope AS (
    SELECT p.id, p.reporting_manager_id, p.doj, p.level_id
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    WHERE d.business_unit_id = p_bu_id
      AND COALESCE(p.is_active, true) = true
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
  ORDER BY COALESCE(lv.rank, 0) DESC NULLS LAST, r.doj ASC NULLS LAST, r.id ASC
  LIMIT 1;
  RETURN v_winner;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_hr_head(p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bu uuid;
BEGIN
  SELECT hr_business_unit_id INTO v_bu FROM public.org_head_config WHERE company_id IS NOT DISTINCT FROM p_company_id LIMIT 1;
  IF v_bu IS NULL THEN RETURN NULL; END IF;
  RETURN public.resolve_bu_head(v_bu);
END $$;

-- 4. Mutation RPCs
CREATE OR REPLACE FUNCTION public.set_bu_head(p_bu_id uuid, p_user_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF coalesce(length(trim(p_reason)),0) < 3 THEN
    RAISE EXCEPTION 'Reason required (min 3 chars)';
  END IF;
  SELECT head_user_id INTO v_prev FROM public.business_units WHERE id = p_bu_id;
  UPDATE public.business_units
    SET head_user_id = p_user_id,
        head_source = 'manual',
        head_updated_at = now(),
        head_updated_by = auth.uid()
    WHERE id = p_bu_id;
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.bu_head_set', auth.uid(),
          jsonb_build_object('bu_id', p_bu_id, 'previous', v_prev, 'new', p_user_id, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_bu_head(p_bu_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid; v_new uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT head_user_id INTO v_prev FROM public.business_units WHERE id = p_bu_id;
  v_new := public.resolve_bu_head(p_bu_id);
  UPDATE public.business_units
    SET head_user_id = v_new,
        head_source = 'auto',
        head_updated_at = now(),
        head_updated_by = auth.uid()
    WHERE id = p_bu_id;
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.bu_head_recalculated', auth.uid(),
          jsonb_build_object('bu_id', p_bu_id, 'previous', v_prev, 'new', v_new));
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.set_hr_department(p_company_id uuid, p_bu_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.org_head_config (company_id, hr_business_unit_id)
  VALUES (p_company_id, p_bu_id)
  ON CONFLICT (company_id) DO UPDATE SET hr_business_unit_id = EXCLUDED.hr_business_unit_id, updated_at = now();
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.hr_department_set', auth.uid(),
          jsonb_build_object('company_id', p_company_id, 'bu_id', p_bu_id));
END $$;

CREATE OR REPLACE FUNCTION public.set_hr_head(p_company_id uuid, p_user_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF coalesce(length(trim(p_reason)),0) < 3 THEN
    RAISE EXCEPTION 'Reason required (min 3 chars)';
  END IF;
  SELECT hr_head_user_id INTO v_prev FROM public.org_head_config WHERE company_id IS NOT DISTINCT FROM p_company_id;
  INSERT INTO public.org_head_config (company_id, hr_head_user_id, hr_head_source, hr_head_updated_at, hr_head_updated_by)
  VALUES (p_company_id, p_user_id, 'manual', now(), auth.uid())
  ON CONFLICT (company_id) DO UPDATE
    SET hr_head_user_id = EXCLUDED.hr_head_user_id,
        hr_head_source = 'manual',
        hr_head_updated_at = now(),
        hr_head_updated_by = auth.uid(),
        updated_at = now();
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.hr_head_set', auth.uid(),
          jsonb_build_object('company_id', p_company_id, 'previous', v_prev, 'new', p_user_id, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_hr_head(p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid; v_new uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT hr_head_user_id INTO v_prev FROM public.org_head_config WHERE company_id IS NOT DISTINCT FROM p_company_id;
  v_new := public.resolve_hr_head(p_company_id);
  INSERT INTO public.org_head_config (company_id, hr_head_user_id, hr_head_source, hr_head_updated_at, hr_head_updated_by)
  VALUES (p_company_id, v_new, 'auto', now(), auth.uid())
  ON CONFLICT (company_id) DO UPDATE
    SET hr_head_user_id = EXCLUDED.hr_head_user_id,
        hr_head_source = 'auto',
        hr_head_updated_at = now(),
        hr_head_updated_by = auth.uid(),
        updated_at = now();
  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('org_heads.hr_head_recalculated', auth.uid(),
          jsonb_build_object('company_id', p_company_id, 'previous', v_prev, 'new', v_new));
  RETURN v_new;
END $$;
