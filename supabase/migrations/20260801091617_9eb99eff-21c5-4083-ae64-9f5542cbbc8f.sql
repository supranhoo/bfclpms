-- ============================================================
-- ADR-226 — Annual Review recommendation tracking (Phase 1)
-- ============================================================

-- 1) Master data: recommendation types --------------------------------------
CREATE TABLE public.annual_review_recommendation_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  is_monetary boolean NOT NULL DEFAULT false,
  requires_amount boolean NOT NULL DEFAULT false,
  requires_target_role boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_recommendation_types TO authenticated;
GRANT ALL ON public.annual_review_recommendation_types TO service_role;

ALTER TABLE public.annual_review_recommendation_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_rec_types_read"
  ON public.annual_review_recommendation_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ar_rec_types_admin_write"
  ON public.annual_review_recommendation_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_ar_rec_types_updated_at
  BEFORE UPDATE ON public.annual_review_recommendation_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.annual_review_recommendation_types
  (key, label, is_monetary, requires_amount, requires_target_role, sort_order)
VALUES
  ('promotion',        'Promotion',                     false, false, true,  10),
  ('special_hike',     'Special hike',                  true,  true,  false, 20),
  ('one_time_reward',  'One-time bonus / reward',       true,  true,  false, 30),
  ('grade_change',     'Grade / band change',           false, false, true,  40),
  ('role_change',      'Role change / rotation',        false, false, true,  50),
  ('training',         'Training / development',        false, false, false, 60),
  ('none',             'No monetary recommendation',    false, false, false, 70);

-- 2) Recommendation record ---------------------------------------------------
CREATE TABLE public.annual_review_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  reviewer_id uuid,
  reviewer_role public.annual_reviewer_role NOT NULL,
  amount_kind text CHECK (amount_kind IS NULL OR amount_kind IN ('absolute','percent')),
  amount_value numeric CHECK (amount_value IS NULL OR amount_value >= 0),
  proposed_designation_id uuid REFERENCES public.designations(id) ON DELETE SET NULL,
  proposed_grade_id uuid REFERENCES public.pms_grades(id) ON DELETE SET NULL,
  effective_from date,
  narrative text,
  source text NOT NULL DEFAULT 'stage_form'
    CHECK (source IN ('stage_form','legacy_import')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','needs_classification','approved',
                      'approved_modified','rejected','deferred','implemented')),
  approved_amount_kind text CHECK (approved_amount_kind IS NULL OR approved_amount_kind IN ('absolute','percent')),
  approved_amount_value numeric CHECK (approved_amount_value IS NULL OR approved_amount_value >= 0),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, reviewer_role)
);

CREATE INDEX idx_ar_rec_cycle_status ON public.annual_review_recommendations (cycle_id, status);
CREATE INDEX idx_ar_rec_employee ON public.annual_review_recommendations (employee_id);
CREATE INDEX idx_ar_rec_reviewer ON public.annual_review_recommendations (reviewer_id);
CREATE INDEX idx_ar_rec_instance ON public.annual_review_recommendations (instance_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_recommendations TO authenticated;
GRANT ALL ON public.annual_review_recommendations TO service_role;

ALTER TABLE public.annual_review_recommendations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ar_rec_updated_at
  BEFORE UPDATE ON public.annual_review_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Recommendation items (type multi-select) --------------------------------
CREATE TABLE public.annual_review_recommendation_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id uuid NOT NULL REFERENCES public.annual_review_recommendations(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.annual_review_recommendation_types(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommendation_id, type_id)
);

CREATE INDEX idx_ar_rec_items_rec ON public.annual_review_recommendation_items (recommendation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_recommendation_items TO authenticated;
GRANT ALL ON public.annual_review_recommendation_items TO service_role;

ALTER TABLE public.annual_review_recommendation_items ENABLE ROW LEVEL SECURITY;

-- 4) Visibility helper (SECURITY DEFINER — avoids RLS recursion) -------------
CREATE OR REPLACE FUNCTION public.ar_can_view_recommendation(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.annual_review_instances i
    WHERE i.id = p_instance_id
      AND (
        auth.uid() IN (i.employee_id, i.manager_id, i.skip_id, i.dept_head_id,
                       i.bu_head_id, i.hr_id, i.management_id)
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'hr_pms')
        OR public.has_role(auth.uid(), 'management')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ar_can_decide_recommendation()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_pms')
      OR public.has_role(auth.uid(), 'management');
$$;

-- 5) Policies ---------------------------------------------------------------
CREATE POLICY "ar_rec_select_participants"
  ON public.annual_review_recommendations FOR SELECT TO authenticated
  USING (public.ar_can_view_recommendation(instance_id));

CREATE POLICY "ar_rec_insert_own_stage"
  ON public.annual_review_recommendations FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() OR public.ar_can_decide_recommendation());

CREATE POLICY "ar_rec_update_own_or_decider"
  ON public.annual_review_recommendations FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() OR public.ar_can_decide_recommendation())
  WITH CHECK (reviewer_id = auth.uid() OR public.ar_can_decide_recommendation());

CREATE POLICY "ar_rec_delete_decider"
  ON public.annual_review_recommendations FOR DELETE TO authenticated
  USING (public.ar_can_decide_recommendation());

CREATE POLICY "ar_rec_items_select"
  ON public.annual_review_recommendation_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.annual_review_recommendations r
    WHERE r.id = recommendation_id AND public.ar_can_view_recommendation(r.instance_id)
  ));

CREATE POLICY "ar_rec_items_write"
  ON public.annual_review_recommendation_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.annual_review_recommendations r
    WHERE r.id = recommendation_id
      AND (r.reviewer_id = auth.uid() OR public.ar_can_decide_recommendation())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.annual_review_recommendations r
    WHERE r.id = recommendation_id
      AND (r.reviewer_id = auth.uid() OR public.ar_can_decide_recommendation())
  ));

-- 6) Audit action whitelist ---------------------------------------------------
ALTER TABLE public.annual_review_access_audit
  DROP CONSTRAINT IF EXISTS annual_review_access_audit_action_check;

ALTER TABLE public.annual_review_access_audit
  ADD CONSTRAINT annual_review_access_audit_action_check CHECK (action = ANY (ARRAY[
    'kill_switch_toggled','override_upserted','override_deleted',
    'management_stage.backfilled','management_stage.backfilled_bulk',
    'management_stage.reverted','management_stage.reverted_after',
    'bu_terminal_restore','collapse_normalise','workflow_edited_post_action',
    'reviewer_reassigned_supersede','system_scores.admin_override','admin_edit',
    'system_scores.admin_correction',
    'recommendation.saved','recommendation.decided','recommendation.bulk_decided'
  ]));