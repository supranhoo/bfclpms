-- ============================================================
-- ADR-259/260 — BU Performance Console (Beta): KPI library
-- Phase 1: master library + linking + merge proposal queue
-- Additive only. No existing table is modified.
-- ============================================================

-- ---------- enums ----------
DO $$ BEGIN
  CREATE TYPE public.kpi_goal_entity_level AS ENUM ('org','bu','department','individual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_goal_progress_type AS ENUM ('number','currency','percentage','rollup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_goal_tracking_method AS ENUM ('manual','rollup','source');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_goal_summary_rule AS ENUM ('last','sum','avg');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_goal_visibility AS ENUM ('public','restricted','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kpi_merge_proposal_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 1. definitions master ----------
CREATE TABLE public.kpi_definitions_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  description TEXT,
  uom TEXT,
  uom_type TEXT,
  frequency TEXT,
  -- goal metric fields (Peoplebox-informed)
  entity_level public.kpi_goal_entity_level NOT NULL DEFAULT 'individual',
  parent_goal_id UUID REFERENCES public.kpi_definitions_master(id) ON DELETE SET NULL,
  progress_type public.kpi_goal_progress_type NOT NULL DEFAULT 'number',
  start_value NUMERIC,
  target_value NUMERIC,
  current_value NUMERIC,
  tracking_method public.kpi_goal_tracking_method NOT NULL DEFAULT 'manual',
  subperiod_summary_rule public.kpi_goal_summary_rule NOT NULL DEFAULT 'last',
  cycle_ref TEXT,
  visibility public.kpi_goal_visibility NOT NULL DEFAULT 'public',
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX kpi_definitions_master_canonical_uidx
  ON public.kpi_definitions_master (
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name),
    entity_level
  );
CREATE INDEX kpi_definitions_master_parent_idx ON public.kpi_definitions_master (parent_goal_id);
CREATE INDEX kpi_definitions_master_bu_idx ON public.kpi_definitions_master (business_unit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_definitions_master TO authenticated;
GRANT ALL ON public.kpi_definitions_master TO service_role;
ALTER TABLE public.kpi_definitions_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_definitions_master_admin_write"
  ON public.kpi_definitions_master FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kpi_definitions_master_oversight_read"
  ON public.kpi_definitions_master FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'hr_pms')
  );

CREATE TRIGGER update_kpi_definitions_master_updated_at
  BEFORE UPDATE ON public.kpi_definitions_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. formulas ----------
CREATE TABLE public.kpi_formulas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  expression TEXT,
  description TEXT,
  source_of_data TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kpi_formulas_name_uidx ON public.kpi_formulas (public.normalize_kpi_text(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_formulas TO authenticated;
GRANT ALL ON public.kpi_formulas TO service_role;
ALTER TABLE public.kpi_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_formulas_admin_write"
  ON public.kpi_formulas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kpi_formulas_oversight_read"
  ON public.kpi_formulas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'hr_pms')
  );

CREATE TRIGGER update_kpi_formulas_updated_at
  BEFORE UPDATE ON public.kpi_formulas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. scoring scales ----------
CREATE TABLE public.kpi_scoring_scales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  criteria TEXT,
  threshold_mode TEXT,
  r0 TEXT, r1 TEXT, r2 TEXT, r3 TEXT, r4 TEXT, r5 TEXT,
  qualitative_options JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kpi_scoring_scales_name_uidx ON public.kpi_scoring_scales (public.normalize_kpi_text(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_scoring_scales TO authenticated;
GRANT ALL ON public.kpi_scoring_scales TO service_role;
ALTER TABLE public.kpi_scoring_scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_scoring_scales_admin_write"
  ON public.kpi_scoring_scales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kpi_scoring_scales_oversight_read"
  ON public.kpi_scoring_scales FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'hr_pms')
  );

CREATE TRIGGER update_kpi_scoring_scales_updated_at
  BEFORE UPDATE ON public.kpi_scoring_scales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. links ----------
CREATE TABLE public.kpi_definition_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  definition_id UUID REFERENCES public.kpi_definitions_master(id) ON DELETE SET NULL,
  formula_id UUID REFERENCES public.kpi_formulas(id) ON DELETE SET NULL,
  scale_id UUID REFERENCES public.kpi_scoring_scales(id) ON DELETE SET NULL,
  linked_by UUID,
  link_source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kpi_id)
);
CREATE INDEX kpi_definition_links_definition_idx ON public.kpi_definition_links (definition_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_definition_links TO authenticated;
GRANT ALL ON public.kpi_definition_links TO service_role;
ALTER TABLE public.kpi_definition_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_definition_links_admin_write"
  ON public.kpi_definition_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kpi_definition_links_oversight_read"
  ON public.kpi_definition_links FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'hr_pms')
  );

CREATE TRIGGER update_kpi_definition_links_updated_at
  BEFORE UPDATE ON public.kpi_definition_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. merge proposals ----------
CREATE TABLE public.kpi_merge_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  canonical_kra_name TEXT NOT NULL,
  canonical_kpi_name TEXT NOT NULL,
  variant_kra_name TEXT NOT NULL,
  variant_kpi_name TEXT NOT NULL,
  similarity NUMERIC,
  match_type TEXT NOT NULL DEFAULT 'exact',
  affected_kpi_count INTEGER NOT NULL DEFAULT 0,
  affected_employee_count INTEGER NOT NULL DEFAULT 0,
  target_definition_id UUID REFERENCES public.kpi_definitions_master(id) ON DELETE SET NULL,
  status public.kpi_merge_proposal_status NOT NULL DEFAULT 'pending',
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kpi_merge_proposals_status_idx ON public.kpi_merge_proposals (status);
CREATE UNIQUE INDEX kpi_merge_proposals_pending_uidx
  ON public.kpi_merge_proposals (
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    public.normalize_kpi_text(canonical_kra_name),
    public.normalize_kpi_text(canonical_kpi_name),
    public.normalize_kpi_text(variant_kra_name),
    public.normalize_kpi_text(variant_kpi_name)
  ) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_merge_proposals TO authenticated;
GRANT ALL ON public.kpi_merge_proposals TO service_role;
ALTER TABLE public.kpi_merge_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_merge_proposals_admin_write"
  ON public.kpi_merge_proposals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kpi_merge_proposals_oversight_read"
  ON public.kpi_merge_proposals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'hr_pms')
  );

CREATE TRIGGER update_kpi_merge_proposals_updated_at
  BEFORE UPDATE ON public.kpi_merge_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
