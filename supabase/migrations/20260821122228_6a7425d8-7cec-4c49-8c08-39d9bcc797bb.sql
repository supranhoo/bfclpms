
-- ADR-309 — KPI Data Ledger: core schema

CREATE TABLE public.org_kpi_dataset_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  kra_name text NOT NULL,
  kpi_name text NOT NULL,
  title text NOT NULL DEFAULT 'Data table',
  description text,
  granularity text NOT NULL DEFAULT 'monthly',
  rollup_rule text NOT NULL DEFAULT 'sum_ratio',
  value_column_key text,
  target_column_key text,
  weight_column_key text,
  allow_provider_override boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT okdd_granularity_chk CHECK (granularity IN ('monthly','quarterly','weekly','event')),
  CONSTRAINT okdd_rollup_chk CHECK (rollup_rule IN ('sum_ratio','sum','avg','weighted','last','max','min','none'))
);
CREATE UNIQUE INDEX okdd_identity_uq ON public.org_kpi_dataset_defs (
  category_id, public.normalize_kpi_text(kra_name), public.normalize_kpi_text(kpi_name)
) WHERE is_active;

CREATE TABLE public.org_kpi_dataset_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.org_kpi_dataset_defs(id) ON DELETE CASCADE,
  column_key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL DEFAULT 'number',
  unit text,
  is_required boolean NOT NULL DEFAULT false,
  is_key boolean NOT NULL DEFAULT false,
  editable_by text NOT NULL DEFAULT 'provider',
  formula text,
  display_format text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT okdc_type_chk CHECK (data_type IN ('number','percent','currency','text','date','select','org_ref','employee_ref','formula')),
  CONSTRAINT okdc_editable_chk CHECK (editable_by IN ('provider','approver','admin','system')),
  CONSTRAINT okdc_key_fmt CHECK (column_key ~ '^[a-z0-9_]{1,48}$'),
  UNIQUE (dataset_id, column_key)
);
CREATE INDEX okdc_dataset_idx ON public.org_kpi_dataset_columns (dataset_id, sort_order);

CREATE TABLE public.org_kpi_dataset_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.org_kpi_dataset_defs(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  review_year integer NOT NULL,
  period_start date,
  division_id uuid REFERENCES public.divisions(id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT,
  location_id uuid,
  pms_grade_id uuid,
  level_id uuid,
  employee_id uuid,
  scope_label text,
  impact_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  entered_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX okdr_dataset_period_idx ON public.org_kpi_dataset_rows (dataset_id, review_year, review_period);
CREATE INDEX okdr_scope_idx ON public.org_kpi_dataset_rows (department_id, business_unit_id, division_id);
CREATE INDEX okdr_employee_idx ON public.org_kpi_dataset_rows (employee_id);
CREATE INDEX okdr_impact_gin ON public.org_kpi_dataset_rows USING gin (impact_scope);

CREATE TABLE public.org_kpi_dataset_row_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL,
  dataset_id uuid NOT NULL,
  revision integer NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  reason text,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT okdrh_action_chk CHECK (action IN ('create','update','delete','import'))
);
CREATE INDEX okdrh_row_idx ON public.org_kpi_dataset_row_history (row_id, revision DESC);

CREATE TABLE public.org_kpi_dataset_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.org_kpi_dataset_defs(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  review_year integer NOT NULL,
  verdict text NOT NULL DEFAULT 'validated',
  note text,
  row_count integer NOT NULL DEFAULT 0,
  validated_by uuid,
  validated_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  CONSTRAINT okdv_verdict_chk CHECK (verdict IN ('validated','rejected'))
);
CREATE INDEX okdv_lookup_idx ON public.org_kpi_dataset_validations (dataset_id, review_year, review_period, validated_at DESC);

GRANT SELECT ON public.org_kpi_dataset_defs TO authenticated;
GRANT SELECT ON public.org_kpi_dataset_columns TO authenticated;
GRANT SELECT ON public.org_kpi_dataset_rows TO authenticated;
GRANT SELECT ON public.org_kpi_dataset_row_history TO authenticated;
GRANT SELECT ON public.org_kpi_dataset_validations TO authenticated;
GRANT ALL ON public.org_kpi_dataset_defs TO service_role;
GRANT ALL ON public.org_kpi_dataset_columns TO service_role;
GRANT ALL ON public.org_kpi_dataset_rows TO service_role;
GRANT ALL ON public.org_kpi_dataset_row_history TO service_role;
GRANT ALL ON public.org_kpi_dataset_validations TO service_role;

-- Employee org scope resolver (department -> BU -> division)
CREATE OR REPLACE FUNCTION public.employee_org_scope(p_user uuid)
RETURNS TABLE (division_id uuid, business_unit_id uuid, department_id uuid, location_id uuid, pms_grade_id uuid, level_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT bu.division_id, d.business_unit_id, p.department_id, p.location_id, p.pms_grade_id, p.level_id
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE p.id = p_user;
$$;

-- Single visibility predicate reused by RLS and read RPC
CREATE OR REPLACE FUNCTION public.can_read_kpi_dataset_row(p_user uuid, p_row public.org_kpi_dataset_rows)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_def public.org_kpi_dataset_defs;
  v_scope record;
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;

  -- Global readers: admin / auditor / hr_pms / management
  IF public.has_role(p_user, 'admin'::app_role)
     OR public.has_role(p_user, 'auditor'::app_role)
     OR public.has_role(p_user, 'hr_pms'::app_role)
     OR public.has_role(p_user, 'management'::app_role) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_row.dataset_id;
  IF v_def.id IS NULL THEN RETURN false; END IF;

  -- Owners of the KPI and approvers on its ladder
  IF public.org_kpi_can_read_central(p_user, v_def.category_id, v_def.kra_name, v_def.kpi_name) THEN
    RETURN true;
  END IF;

  -- Named employee row
  IF p_row.employee_id = p_user THEN RETURN true; END IF;

  -- Explicit impact list
  IF coalesce(p_row.impact_scope->>'whole_org','false') = 'true' THEN RETURN true; END IF;
  IF (p_row.impact_scope ? 'employee_ids')
     AND (p_row.impact_scope->'employee_ids') @> to_jsonb(p_user::text) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_scope FROM public.employee_org_scope(p_user);
  IF v_scope IS NULL THEN RETURN false; END IF;

  IF (p_row.impact_scope ? 'department_ids') AND v_scope.department_id IS NOT NULL
     AND (p_row.impact_scope->'department_ids') @> to_jsonb(v_scope.department_id::text) THEN
    RETURN true;
  END IF;
  IF (p_row.impact_scope ? 'business_unit_ids') AND v_scope.business_unit_id IS NOT NULL
     AND (p_row.impact_scope->'business_unit_ids') @> to_jsonb(v_scope.business_unit_id::text) THEN
    RETURN true;
  END IF;

  -- Structural scope match: every non-null scope column on the row must cover the reader
  IF p_row.employee_id IS NOT NULL THEN RETURN false; END IF;
  IF p_row.department_id IS NOT NULL AND p_row.department_id IS DISTINCT FROM v_scope.department_id THEN RETURN false; END IF;
  IF p_row.business_unit_id IS NOT NULL AND p_row.business_unit_id IS DISTINCT FROM v_scope.business_unit_id THEN RETURN false; END IF;
  IF p_row.division_id IS NOT NULL AND p_row.division_id IS DISTINCT FROM v_scope.division_id THEN RETURN false; END IF;
  IF p_row.location_id IS NOT NULL AND p_row.location_id IS DISTINCT FROM v_scope.location_id THEN RETURN false; END IF;
  IF p_row.pms_grade_id IS NOT NULL AND p_row.pms_grade_id IS DISTINCT FROM v_scope.pms_grade_id THEN RETURN false; END IF;
  IF p_row.level_id IS NOT NULL AND p_row.level_id IS DISTINCT FROM v_scope.level_id THEN RETURN false; END IF;

  RETURN true;
END;
$$;

-- Write authority for a dataset (provider / approver / admin)
CREATE OR REPLACE FUNCTION public.can_write_kpi_dataset(p_user uuid, p_dataset_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_kpi_dataset_defs d
    WHERE d.id = p_dataset_id
      AND (
        public.has_role(p_user, 'admin'::app_role)
        OR public.bu_console_can_write(p_user)
        OR EXISTS (
          SELECT 1 FROM public.org_kpi_data_owners o
          WHERE o.owner_id = p_user
            AND o.category_id = d.category_id
            AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(d.kra_name)
            AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(d.kpi_name)
        )
      )
  );
$$;

ALTER TABLE public.org_kpi_dataset_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_kpi_dataset_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_kpi_dataset_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_kpi_dataset_row_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_kpi_dataset_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY okdd_select ON public.org_kpi_dataset_defs FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY okdc_select ON public.org_kpi_dataset_columns FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY okdr_select ON public.org_kpi_dataset_rows FOR SELECT TO authenticated
  USING (public.can_read_kpi_dataset_row(auth.uid(), org_kpi_dataset_rows.*));
CREATE POLICY okdrh_select ON public.org_kpi_dataset_row_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_kpi_dataset_rows r
    WHERE r.id = org_kpi_dataset_row_history.row_id
      AND public.can_read_kpi_dataset_row(auth.uid(), r.*)
  ));
CREATE POLICY okdv_select ON public.org_kpi_dataset_validations FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Any row change invalidates a standing audit validation for that dataset+period
CREATE OR REPLACE FUNCTION public.okd_invalidate_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.org_kpi_dataset_rows;
BEGIN
  r := COALESCE(NEW, OLD);
  UPDATE public.org_kpi_dataset_validations v
     SET invalidated_at = now(),
         invalidated_reason = 'Ledger data changed after validation'
   WHERE v.dataset_id = r.dataset_id
     AND v.review_period = r.review_period
     AND v.review_year = r.review_year
     AND v.verdict = 'validated'
     AND v.invalidated_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER okdr_invalidate_validation
AFTER INSERT OR UPDATE OR DELETE ON public.org_kpi_dataset_rows
FOR EACH ROW EXECUTE FUNCTION public.okd_invalidate_validation();

CREATE OR REPLACE FUNCTION public.okd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER okdd_touch BEFORE UPDATE ON public.org_kpi_dataset_defs
FOR EACH ROW EXECUTE FUNCTION public.okd_touch_updated_at();
CREATE TRIGGER okdr_touch BEFORE UPDATE ON public.org_kpi_dataset_rows
FOR EACH ROW EXECUTE FUNCTION public.okd_touch_updated_at();
