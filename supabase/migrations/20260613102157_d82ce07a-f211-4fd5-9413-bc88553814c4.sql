
DO $$ BEGIN
  CREATE TYPE public.annual_review_status AS ENUM (
    'not_started','pending_self','pending_manager','pending_skip',
    'pending_bu','pending_hr','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.annual_reviewer_role AS ENUM (
    'self','manager','skip_manager','bu_head','hr'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tg_annual_review_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- cycles
CREATE TABLE public.annual_review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  review_year integer NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
  self_review_start date, self_review_end date,
  manager_review_start date, manager_review_end date,
  skip_review_start date, skip_review_end date,
  bu_review_start date, bu_review_end date,
  hr_finalization_deadline date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX annual_review_cycles_one_active
  ON public.annual_review_cycles ((status)) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_cycles TO authenticated;
GRANT ALL ON public.annual_review_cycles TO service_role;
ALTER TABLE public.annual_review_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cycles_select_all_auth" ON public.annual_review_cycles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_admin_write" ON public.annual_review_cycles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE TRIGGER annual_review_cycles_updated_at
  BEFORE UPDATE ON public.annual_review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_set_updated_at();

-- templates
CREATE TABLE public.annual_review_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_templates TO authenticated;
GRANT ALL ON public.annual_review_templates TO service_role;
ALTER TABLE public.annual_review_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select_all_auth" ON public.annual_review_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin_write" ON public.annual_review_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE TRIGGER annual_review_templates_updated_at
  BEFORE UPDATE ON public.annual_review_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_set_updated_at();

-- rules
CREATE TABLE public.annual_review_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.annual_review_templates(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  name text,
  priority integer NOT NULL DEFAULT 10,
  filters jsonb NOT NULL DEFAULT '{"roles":[],"grades":[],"levels":[],"bu_ids":[],"department_ids":[]}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX annual_review_rules_cycle ON public.annual_review_assignment_rules(cycle_id, priority);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_assignment_rules TO authenticated;
GRANT ALL ON public.annual_review_assignment_rules TO service_role;
ALTER TABLE public.annual_review_assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select_all_auth" ON public.annual_review_assignment_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_admin_write" ON public.annual_review_assignment_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE TRIGGER annual_review_rules_updated_at
  BEFORE UPDATE ON public.annual_review_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_set_updated_at();

-- instances
CREATE TABLE public.annual_review_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.annual_review_templates(id),
  cycle_id uuid NOT NULL REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  assigned_rule_id uuid REFERENCES public.annual_review_assignment_rules(id),
  overall_status public.annual_review_status NOT NULL DEFAULT 'pending_self',
  manager_id uuid REFERENCES public.profiles(id),
  skip_id uuid REFERENCES public.profiles(id),
  bu_head_id uuid REFERENCES public.profiles(id),
  hr_id uuid REFERENCES public.profiles(id),
  system_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  criteria_weighted_score numeric(6,2),
  total_score numeric(6,2),
  final_rating text,
  hr_remarks text,
  language_pref text NOT NULL DEFAULT 'en',
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, cycle_id)
);
CREATE INDEX annual_review_instances_employee ON public.annual_review_instances(employee_id);
CREATE INDEX annual_review_instances_cycle    ON public.annual_review_instances(cycle_id);
CREATE INDEX annual_review_instances_mgr      ON public.annual_review_instances(manager_id);
CREATE INDEX annual_review_instances_skip     ON public.annual_review_instances(skip_id);
CREATE INDEX annual_review_instances_bu       ON public.annual_review_instances(bu_head_id);
CREATE INDEX annual_review_instances_hr       ON public.annual_review_instances(hr_id);
CREATE INDEX annual_review_instances_status   ON public.annual_review_instances(overall_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_instances TO authenticated;
GRANT ALL ON public.annual_review_instances TO service_role;
ALTER TABLE public.annual_review_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instances_select_visible" ON public.annual_review_instances
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR manager_id = auth.uid() OR skip_id = auth.uid()
    OR bu_head_id = auth.uid() OR hr_id = auth.uid()
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
  );
CREATE POLICY "instances_admin_insert" ON public.annual_review_instances
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE POLICY "instances_stage_update" ON public.annual_review_instances
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR (employee_id = auth.uid() AND overall_status = 'pending_self')
    OR (manager_id  = auth.uid() AND overall_status = 'pending_manager')
    OR (skip_id     = auth.uid() AND overall_status = 'pending_skip')
    OR (bu_head_id  = auth.uid() AND overall_status = 'pending_bu')
    OR (hr_id       = auth.uid() AND overall_status = 'pending_hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR employee_id = auth.uid() OR manager_id = auth.uid()
    OR skip_id = auth.uid() OR bu_head_id = auth.uid() OR hr_id = auth.uid()
  );
CREATE POLICY "instances_admin_delete" ON public.annual_review_instances
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE TRIGGER annual_review_instances_updated_at
  BEFORE UPDATE ON public.annual_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_set_updated_at();

-- responses
CREATE TABLE public.annual_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewer_role public.annual_reviewer_role NOT NULL,
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualitative_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  weighted_score numeric(6,2),
  submitted_at timestamptz,
  is_locked boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id, reviewer_role)
);
CREATE INDEX annual_review_responses_instance ON public.annual_review_responses(instance_id);
CREATE INDEX annual_review_responses_reviewer ON public.annual_review_responses(reviewer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_responses TO authenticated;
GRANT ALL ON public.annual_review_responses TO service_role;
ALTER TABLE public.annual_review_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses_select_visible" ON public.annual_review_responses
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = instance_id
        AND (
          (i.employee_id = auth.uid() AND i.overall_status = 'completed')
          OR i.manager_id = auth.uid() OR i.skip_id = auth.uid()
          OR i.bu_head_id = auth.uid() OR i.hr_id = auth.uid()
        )
    )
  );
CREATE POLICY "responses_self_insert" ON public.annual_review_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR reviewer_id = auth.uid()
  );
CREATE POLICY "responses_self_update" ON public.annual_review_responses
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR (reviewer_id = auth.uid() AND is_locked = false)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')
    OR reviewer_id = auth.uid()
  );
CREATE POLICY "responses_admin_delete" ON public.annual_review_responses
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
CREATE TRIGGER annual_review_responses_updated_at
  BEFORE UPDATE ON public.annual_review_responses
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_set_updated_at();

-- RPC
CREATE OR REPLACE FUNCTION public.advance_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role
)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_next public.annual_review_status;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;
  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'self'         AND (v_inst.employee_id <> v_caller OR v_inst.overall_status <> 'pending_self')) OR
       (p_reviewer_role = 'manager'      AND (v_inst.manager_id  <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id     <> v_caller OR v_inst.overall_status <> 'pending_skip')) OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id  <> v_caller OR v_inst.overall_status <> 'pending_bu')) OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id       <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;
  UPDATE public.annual_review_responses
     SET is_locked = true, submitted_at = COALESCE(submitted_at, now())
   WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role;
  v_next := CASE v_inst.overall_status
    WHEN 'pending_self'    THEN 'pending_manager'
    WHEN 'pending_manager' THEN 'pending_skip'
    WHEN 'pending_skip'    THEN 'pending_bu'
    WHEN 'pending_bu'      THEN 'pending_hr'
    WHEN 'pending_hr'      THEN 'completed'
    ELSE v_inst.overall_status
  END::public.annual_review_status;
  UPDATE public.annual_review_instances
     SET overall_status = v_next,
         finalized_at = CASE WHEN v_next = 'completed' THEN now() ELSE finalized_at END,
         finalized_by = CASE WHEN v_next = 'completed' THEN v_caller ELSE finalized_by END,
         updated_at = now()
   WHERE id = p_instance_id;
  RETURN v_next;
END $$;
GRANT EXECUTE ON FUNCTION public.advance_annual_review_status(uuid, public.annual_reviewer_role) TO authenticated;

-- feature flag
INSERT INTO public.admin_feature_flags(key, value, description, target_roles)
VALUES (
  'annual_review_enabled',
  jsonb_build_object('enabled', false),
  'Master switch for the Annual Review module (Phase 1).',
  ARRAY['admin','hr_pms']::public.app_role[]
)
ON CONFLICT (key) DO NOTHING;

-- menu registry
INSERT INTO public.menu_registry(
  menu_key, default_label, module_key, default_parent_key, menu_level,
  route_path, icon_name, default_sort_order, accepts_children,
  is_renamable, is_movable, is_cross_app_movable, is_system_required,
  feature_key, permission_key
) VALUES
  ('annual_review_self',  'My Annual Review',    'annual_review', NULL, 1,
   '/annual-review',       'ClipboardCheck', 900, false, true, true, false, false,
   'annual_review_enabled', NULL),
  ('annual_review_team',  'Team Annual Review',  'annual_review', NULL, 1,
   '/annual-review/team',  'Users',          901, false, true, true, false, false,
   'annual_review_enabled', NULL),
  ('annual_review_admin', 'Annual Review Admin', 'annual_review', NULL, 1,
   '/annual-review/admin', 'Settings2',      902, false, true, true, false, false,
   'annual_review_enabled', NULL)
ON CONFLICT (menu_key) DO NOTHING;
